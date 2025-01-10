// Notion compound filter only supports 2 levels of and/or, so we need to flatten it into a Disjunctive Normal Form (DNF) using the distribution law.

/**
 * Flattens a Notion-like filter into a two-level DNF structure:
 * 
 *   OR of (AND of leaf-filters)
 * 
 * In the returned object, you'll get something like:
 * 
 * {
 *   or: [
 *     { and: [ /* leaf1, leaf2, ... *\/ ] },
 *     { and: [ /* leaf1, leaf2, ... *\/ ] },
 *     ...
 *   ]
 * }
 */

/**
 * Cross-product utility to combine two arrays of conjunctions.
 * If dnf1 = [ [A], [B] ] and dnf2 = [ [C], [D] ],
 * the result is [ [A, C], [A, D], [B, C], [B, D] ].
 *
 * @param {Array<Array<any>>} dnf1 - An array of conjunctions
 * @param {Array<Array<any>>} dnf2 - Another array of conjunctions
 * @returns {Array<Array<any>>} cross product of the two arrays
 */
function crossConjunctions(dnf1, dnf2) {
  const result = [];
  for (const conj1 of dnf1) {
    for (const conj2 of dnf2) {
      result.push([...conj1, ...conj2]);
    }
  }
  return result;
}

/**
 * Converts a filter node into an array of conjunctions (DNF).
 * Each conjunction is an array of leaf filters.
 *
 * @param {Object} node - A filter node which may have 'and', 'or', or be a leaf
 * @returns {Array<Array<Object>>} - Disjunction of conjunctions
 *    e.g. [ [leaf1, leaf2], [leaf3] ] means (leaf1 AND leaf2) OR (leaf3)
 */
function toDNF(node) {
  // 1) If `node` looks like a leaf filter (assume anything without 'and'/'or'):
  if (!node.or && !node.and) {
    // Return a DNF that is just one conjunction containing this leaf
    return [[node]];
  }

  // 2) If node has `and`, we take the DNF of each child and cross them.
  if (node.and) {
    // Start with a "neutral element" for cross: one empty conjunction
    let result = [[]];
    for (const child of node.and) {
      const childDNF = toDNF(child);
      result = crossConjunctions(result, childDNF);
    }
    return result;
  }

  // 3) If node has `or`, we union all child DNFs (just concatenation).
  if (node.or) {
    let result = [];
    for (const child of node.or) {
      const childDNF = toDNF(child);
      result = [...result, ...childDNF];
    }
    return result;
  }

  // Fallback (shouldn't happen with well-formed input)
  return [];
}

/**
 * Main function that flattens any nested `and`/`or` filter
 * into a two-level structure: { or: [ { and: [...] }, ... ] }.
 *
 * @param {Object} filter - The original Notion-like filter
 * @returns {Object} Flattened filter
 */
function flattenFilter(filter) {
  // Convert to array-of-arrays DNF form
  const dnf = toDNF(filter);

  // Build final object: top-level `or` of multiple `and` clauses
  // Each conjunction becomes { and: [ ...leafFilters ] }
  return simplifyDnf(dnf);
}

/**
 * Simplifies a DNF such that if a conjunction has only one leaf, it is converted to a leaf.
 * 
 * @param {Array<Array<Object>>} dnf - The DNF to clean up
 * @returns {Object} - The simplified form
 */
function simplifyDnf(dnf) {
  const result = dnf.map(conjunction => {
    if (conjunction.length === 1) {
      return conjunction[0];
    }
    return { and: conjunction };
  });

  if (result.length === 1) {
    return result[0];
  }
  return { or: result };
}

export { flattenFilter };