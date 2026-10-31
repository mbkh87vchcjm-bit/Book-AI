/* Midad Language & Knowledge Engine (MLKE) — Cumulative Learning & Feedback Engine */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MlkeLearning = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function LearningStore(initialData) {
    var data = initialData || {};
    this.experience = Array.isArray(data.experience) ? data.experience : [];
    this.corrections = Array.isArray(data.corrections) ? data.corrections : [];
    this.termWeights = data.termWeights && typeof data.termWeights === 'object' ? data.termWeights : {};
    this.candidates = Array.isArray(data.candidates) ? data.candidates : [];
    this.maxExperience = 250;
  }

  LearningStore.prototype.recordExperience = function (exp) {
    if (!exp) return;
    var record = {
      id: exp.id || ('exp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
      timestamp: Date.now(),
      question: exp.question || '',
      intent: exp.intent || 'general',
      entities: Array.isArray(exp.entities) ? exp.entities : [],
      retrievedChunks: Array.isArray(exp.retrievedChunks) ? exp.retrievedChunks : [],
      answerText: exp.answerText || '',
      references: Array.isArray(exp.references) ? exp.references : [],
      userRating: exp.userRating || null,
      correctionText: exp.correctionText || null
    };
    this.experience.unshift(record);
    if (this.experience.length > this.maxExperience) {
      this.experience = this.experience.slice(0, this.maxExperience);
    }
    return record.id;
  };

  LearningStore.prototype.applyFeedback = function (questionTerms, isPositive) {
    var terms = Array.isArray(questionTerms) ? questionTerms : [];
    var delta = isPositive ? 0.05 : -0.05;
    for (var i = 0; i < terms.length; i++) {
      var t = String(terms[i]).toLowerCase();
      var current = this.termWeights[t] !== undefined ? this.termWeights[t] : 1.0;
      var updated = Math.max(0.5, Math.min(2.0, current + delta));
      this.termWeights[t] = Number(updated.toFixed(3));
    }
  };

  LearningStore.prototype.getTermWeight = function (term) {
    var t = String(term || '').toLowerCase();
    return this.termWeights[t] !== undefined ? this.termWeights[t] : 1.0;
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
      status: 'user-confirmed' // 'candidate' | 'evidence-backed' | 'user-confirmed' | 'rejected'
    };
    this.corrections.unshift(correction);
    return correction;
  };

  LearningStore.prototype.lookupCorrection = function (originalText) {
    var orig = String(originalText || '').trim().toLowerCase();
    for (var i = 0; i < this.corrections.length; i++) {
      var c = this.corrections[i];
      if (c.status === 'user-confirmed' && c.original.toLowerCase() === orig) {
        return c;
      }
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
    if (!cand) return false;
    cand.status = newStatus; // 'user-confirmed' or 'rejected'
    return true;
  };

  LearningStore.prototype.exportData = function () {
    return {
      version: 1,
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
