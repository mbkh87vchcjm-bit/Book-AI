/* Local, rule-based knowledge extraction. Every fact keeps exact source provenance. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MidadKnowledgeGraph = factory(root.MidadEngine);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';
  var RULES = [
    {id:'ar-definition-v1',predicate:'is_a',pattern:/^(.{2,70}?)\s+(?:هو|هي)\s+(.{2,140})$/},
    {id:'ar-composition-v1',predicate:'contains',pattern:/^(.{2,70}?)\s+(?:يتكون من|تتكون من|يتكوّن من|تتكوّن من)\s+(.{2,140})$/},
    {id:'ar-uses-v1',predicate:'uses',pattern:/^(.{2,70}?)\s+(?:يستخدم|تستخدم)\s+(.{2,140})$/},
    {id:'ar-transmits-v1',predicate:'transmits',pattern:/^(.{2,70}?)\s+(?:ينقل|تنقل)\s+(.{2,140})$/},
    {id:'en-definition-v1',predicate:'is_a',pattern:/^(.{2,70}?)\s+is\s+(?:(?:a|an|the)\s+)?(.{2,140})$/i},
    {id:'en-composition-v1',predicate:'contains',pattern:/^(.{2,70}?)\s+(?:consists\s+of|is composed of|comprises)\s+(.{2,140})$/i},
    {id:'en-contains-v1',predicate:'contains',pattern:/^(.{2,70}?)\s+contains?\s+(.{2,140})$/i},
    {id:'en-uses-v1',predicate:'uses',pattern:/^(.{2,70}?)\s+uses?\s+(.{2,140})$/i},
    {id:'en-transmits-v1',predicate:'transmits',pattern:/^(.{2,70}?)\s+transmits?\s+(.{2,140})$/i},
    {id:'en-translates-v1',predicate:'translates',pattern:/^(.{2,70}?)\s+translates?\s+(.{2,140})$/i}
  ];
  var LABELS={is_a:'تعريف / نوع',contains:'يتكوّن من / يحتوي على',uses:'يستخدم',transmits:'ينقل',translates:'يترجم'};
  function clean(value,max){return String(value||'').replace(/\s+/g,' ').trim().replace(/^[\s:،,;؛\-–—]+|[\s.،,;؛!?؟]+$/g,'').slice(0,max||160).trim();}
  function key(value){return E.normalize(value).replace(/[^a-z0-9\u0600-\u06ff]+/g,' ').trim();}
  function hash(value){var h=2166136261;for(var i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return 'kg-'+(h>>>0).toString(36);}
  function split(text){return (String(text||'').match(/[^.!؟?\n]+[.!؟?]?/g)||[]).map(function(x){return x.trim();}).filter(function(x){return x.length>=12&&x.length<=260;});}
  function extractSentence(sentence,doc,page){
    var source=String(sentence||'').trim();
    if(!source||!doc||!doc.id||!doc.name||!page||!Number.isInteger(Number(page.page))||Number(page.page)<1)return null;
    for(var i=0;i<RULES.length;i++){
      var rule=RULES[i],m=rule.pattern.exec(source);if(!m)continue;
      var subject=clean(m[1],70),object=clean(m[2],140);
      if(!subject||!object||key(subject)===key(object)||!E.words(subject).length||!E.words(object).length)return null;
      return {id:hash([doc.id,page.page,rule.id,key(subject),key(object),key(source)].join('|')),
        subject:subject,predicate:rule.predicate,object:object,docId:String(doc.id),docName:String(doc.name),
        type:doc.type==='pdf'?'pdf':'text',page:Number(page.page),excerpt:source,status:'candidate',
        extractionRule:rule.id,ruleScore:0.7};
    }
    return null;
  }
  function extractPage(doc,page){
    if(!doc||!doc.id||!doc.name||!page||!Number.isInteger(Number(page.page))||Number(page.page)<1)return [];
    var out=[];split(page.text).forEach(function(sentence){if(out.length>=10)return;var f=extractSentence(sentence,doc,page);if(f&&!out.some(function(x){return x.id===f.id;}))out.push(f);});return out;
  }
  function extractDocument(doc){
    if(!doc||!doc.id||!doc.name||!Array.isArray(doc.pages))return [];
    var out=[];for(var i=0;i<doc.pages.length&&out.length<250;i++)out=out.concat(extractPage(doc,doc.pages[i])).slice(0,250);return out;
  }
  function merge(existing,additions){
    var out=Array.isArray(existing)?existing.slice():[],seen=new Set(out.map(function(f){return f&&f.id;}).filter(Boolean));
    (Array.isArray(additions)?additions:[]).forEach(function(f){if(!f||!f.id||seen.has(f.id))return;out.push(f);seen.add(f.id);});return out.slice(-1000);
  }
  function applyReview(facts,id,status){
    if(status!=='user-confirmed'&&status!=='rejected'&&status!=='candidate')return false;
    if(!Array.isArray(facts))return false;var f=facts.find(function(x){return x&&x.id===id;});if(!f)return false;
    f.status=status;f.reviewedAt=status==='candidate'?null:Date.now();return true;
  }
  function stats(facts){
    var out={total:0,candidate:0,confirmed:0,rejected:0};
    (Array.isArray(facts)?facts:[]).forEach(function(f){if(!f||!f.id)return;out.total++;if(f.status==='candidate')out.candidate++;else if(f.status==='user-confirmed'||f.status==='evidence-backed')out.confirmed++;else if(f.status==='rejected')out.rejected++;});return out;
  }
  function search(facts,query,limit){
    limit=Math.max(1,Math.min(10,Number(limit)||3));
    var q=E.expandQueryTerms?E.expandQueryTerms(query,E.words(query)):E.words(query),terms=Array.from(new Set(q));if(!terms.length)return [];
    return (Array.isArray(facts)?facts:[]).filter(function(f){return f&&(f.status==='user-confirmed'||f.status==='evidence-backed')&&f.docId&&f.docName&&Number.isInteger(Number(f.page))&&Number(f.page)>0&&f.excerpt;})
      .map(function(f){var words=new Set(E.words([f.subject,f.object,f.excerpt].join(' '))),matched=terms.filter(function(t){return words.has(t);});
        var score=matched.length/Math.max(1,terms.length),subject=key(f.subject),queryKey=key(query);if(subject&&queryKey.indexOf(subject)>=0)score+=0.35;
        return {fact:f,score:score,matched:matched.length};})
      .filter(function(x){return x.score>0&&x.matched>0;}).sort(function(a,b){return b.score-a.score||b.matched-a.matched;}).slice(0,limit);
  }
  return {extractPage:extractPage,extractDocument:extractDocument,merge:merge,applyReview:applyReview,stats:stats,search:search,predicateLabel:function(p){return LABELS[p]||p||'علاقة';}};
}));
