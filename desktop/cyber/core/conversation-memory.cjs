'use strict';

const MAX_HISTORY_MESSAGES = 4;
const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_CHARS = 3000;

function cleanText(value, maximum) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, maximum);
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const accepted = messages.slice(-MAX_HISTORY_MESSAGES).map((item) => {
    if (!item || !['user', 'assistant'].includes(item.role)) return null;
    const content = cleanText(item.content, MAX_MESSAGE_CHARS);
    return content ? {role: item.role, content} : null;
  }).filter(Boolean);
  let total = accepted.reduce((sum, item) => sum + item.content.length, 0);
  while (accepted.length && total > MAX_HISTORY_CHARS) {
    total -= accepted[0].content.length;
    accepted.shift();
  }
  return accepted;
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim();
}

function isFollowUp(question) {
  const query = normalize(question);
  if (!query) return false;
  const arabicPatterns = [
    /(?:اشرح|وضح|فصل|وسع).{0,18}(?:ها|ه|ذلك|اكثر|بالتفصيل)/,
    /(?:اكمل|تابع|استمر|زدني|مثال اخر|مثال ثاني|ما الفرق بينهما|ماذا عن|وماذا عن|وبالنسبه|هل هي|هل هو|كيف ذلك|لم افهم|ما قصدك|اعطني مثالا|اذكر مثالا|ما مميزاتها|ما عيوبها)/,
    /^(?:لماذا|كيف|ما المقصود|ماذا تقصد|والثاني|والثانيه|وماذا بعد)[؟?!. ]*$/
  ];
  const englishPatterns = [
    /\b(?:what about it|what about them|why is that|how so|continue|go on|elaborate|explain more|give another example|what does that mean)\b/,
    /^(?:why|how|and then|more|another example|what about it)[?.! ]*$/
  ];
  return arabicPatterns.some((pattern) => pattern.test(query)) ||
    englishPatterns.some((pattern) => pattern.test(query));
}

function buildRetrievalInput(question, history) {
  const current = cleanText(question, 4000);
  const messages = cleanMessages(history);
  const useHistory = messages.length > 0 && isFollowUp(current);
  if (!useHistory) return {query: current, usedHistory: false};
  const carry = messages.slice(-4)
    .map((item) => item.role + ': ' + item.content)
    .join('\n');
  return {
    query: (current + '\nسياق السؤال السابق والإجابة السابقة:\n' + carry).slice(0, 7000),
    usedHistory: true
  };
}

function appendTurn(history, question, answer) {
  return cleanMessages([
    ...cleanMessages(history),
    {role: 'user', content: cleanText(question, MAX_MESSAGE_CHARS)},
    {role: 'assistant', content: cleanText(answer, MAX_MESSAGE_CHARS)}
  ]);
}

module.exports = {MAX_HISTORY_MESSAGES, MAX_MESSAGE_CHARS, MAX_HISTORY_CHARS, cleanMessages, isFollowUp, buildRetrievalInput, appendTurn};
