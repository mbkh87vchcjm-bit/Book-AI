/* Midad Language & Knowledge Engine (MLKE) — Cumulative Learning & Feedback Engine */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MlkeLearning = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RATING_SCORES = {positive: 1, neutral: 0, negative: -1};

  function uniqueTerms(input) {
    var seen = Object.create(null), output = [];
    (Array.isArray(input) ? input : []).forEach(function (value) {
      var term = String(value == null ? '' : value).trim().toLowerCase();
      if (!term || term.length > 80 || seen[term]) return;
      seen[term] = true;
      output.push(term);
    });
    return output;
  }

  function LearningStore(initialData) {
    var data = initialData || {};
    this.experience = Array.isArray(data.experience) ? data.experience : [];
    this.corrections = Array.isArray(data.corrections) ? data.corrections : [];
    this.termWeights = data.termWeights && typeof data.termWeights === 'object' ? data.termWeights : {};
    this.candidates = Array.isArray(data.candidates) ? data.candidates : [];
    this.maxExperience = 250;
  }

  LearningStore.prototype.recordExperience = function (exp) {
    if (!exp) return null;
    var rating = Object.prototype.hasOwnProperty.call(RATING_SCORES, exp.userRating) ? exp.userRating : null;
    var record = {
      id: exp.id || ('exp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
      messageId: String(exp.messageId || ''),
      timestamp: Date.now(),
      question: String(exp.question || ''),
      intent: exp.intent || 'general',
      entities: Array.isArray(exp.entities) ? exp.entities : [],
      retrievedChunks: Array.isArray(exp.retrievedChunks) ? exp.retrievedChunks : [],
      answerText: exp.answerText || '',
      references: Array.isArray(exp.references) ? exp.references : [],
      userRating: rating,
      ratingUpdatedAt: rating ? Date.now() : null,
      correctionText: exp.correctionText || null
    };
    this.experience.unshift(record);
    if (this.experience.length > this.maxExperience) {
      this.experience = this.experience.slice(0, this.maxExperience);
    }
    return record.id;
  };

  LearningStore.prototype.getExperience = function (experienceId) {
    var id = String(experienceId || '');
    if (!id) return null;
    return this.experience.find(function (record) { return record && record.id === id; }) || null;
  };

  LearningStore.prototype.adjustTermWeights = function (questionTerms, delta) {
    var terms = uniqueTerms(questionTerms);
    var amount = Number(delta);
    if (!Number.isFinite(amount) || !terms.length || amount === 0) return 0;
    terms.forEach(function (term) {
      var stored = Number(this.termWeights[term]);
      var current = Number.isFinite(stored) ? Math.max(0.5, Math.min(2.0, stored)) : 1.0;
      var updated = Math.max(0.5, Math.min(2.0, current + amount));
      this.termWeights[term] = Number(updated.toFixed(3));
    }, this);
    return terms.length;
  };

  // Legacy API retained for existing callers; duplicate tokens count only once.
  LearningStore.prototype.applyFeedback = function (questionTerms, isPositive) {
    return this.adjustTermWeights(questionTerms, isPositive ? 0.05 : -0.05);
  };

  // Apply only the difference from the previous rating. Repeated taps cannot
  // keep changing weights; switching a rating reverses its previous effect.
  LearningStore.prototype.rateExperience = function (experienceId, rating, questionTerms) {
    var record = this.getExperience(experienceId);
    if (!record) return {changed: false, reason: 'not-found'};
    if (!Object.prototype.hasOwnProperty.call(RATING_SCORES, rating)) {
      return {changed: false, reason: 'invalid-rating'};
    }
    var previous = Object.prototype.hasOwnProperty.call(RATING_SCORES, record.userRating)
      ? record.userRating : null;
    if (previous === rating) return {changed: false, reason: 'unchanged', rating: previous};

    var previousScore = previous === null ? 0 : RATING_SCORES[previous];
    var delta = (RATING_SCORES[rating] - previousScore) * 0.05;
    var updatedTerms = this.adjustTermWeights(questionTerms, delta);
    record.userRating = rating;
    record.ratingUpdatedAt = Date.now();
    return {changed: true, previous: previous, rating: rating, updatedTerms: updatedTerms, delta: delta};
  };

  LearningStore.prototype.getTermWeight = function (term) {
    var t = String(term || '').toLowerCase();
    var value = Number(this.termWeights[t]);
    return Number.isFinite(value) ? Math.max(0.5, Math.min(2.0, value)) : 1.0;
  };

  LearningStore.prototype.recordCorrection = function (item) {
    if (!item || !item.original) return null;
    var correction = {
      id: 'corr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      type: item.type || 'translation', // 'translation' | 'answer' | 'term'
      original: item.original.trim(),
      corrected: (item.corrected || '').trim(),
      context: item.context || '',
      docName: item.docName || '',
      page: item.page || null,
      status: 'user-confirmed'
    };
    this.corrections.unshift(correction);
    return correction;
  };

  LearningStore.prototype.lookupCorrection = function (originalText) {
    var orig = String(originalText || '').trim().toLowerCase();
    for (var i = 0; i < this.corrections.length; i++) {
      var c = this.corrections[i];
      if (c.status === 'user-confirmed' && c.original.toLowerCase() === orig) return c;
    }
    return null;
  };

  LearningStore.prototype.addCandidateConcept = function (concept) {
    if (!concept || !concept.term) return false;
    var exists = this.candidates.some(function (c) {
      return c.term.toLowerCase() === concept.term.toLowerCase();
    });
    if (exists) return false;

    this.candidates.push({
      id: 'cand-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      term: concept.term,
      definition: concept.definition || '',
      sourceText: concept.sourceText || '',
      docName: concept.docName || '',
      page: concept.page || 1,
      status: 'candidate',
      timestamp: Date.now()
    });
    return true;
  };

  LearningStore.prototype.updateCandidateStatus = function (candidateId, newStatus) {
    var cand = this.candidates.find(function (c) { return c.id === candidateId; });
    if (!cand || (newStatus !== 'user-confirmed' && newStatus !== 'rejected')) return false;
    cand.status = newStatus;
    return true;
  };

  LearningStore.prototype.exportData = function () {
    return {
      version: 2,
      experience: this.experience,
      corrections: this.corrections,
      termWeights: this.termWeights,
      candidates: this.candidates
    };
  };

  LearningStore.prototype.resetWeights = function () {
    this.termWeights = {};
  };

  return LearningStore;
}));
