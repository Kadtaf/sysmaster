import { Symptom } from './model';

/**
 * Extraction v1 des symptômes depuis une description libre, par synonymes normalisés.
 * Volontairement simple : elle sera remplacée en Phase 3 par une extraction structurée par LLM,
 * derrière la même signature, sans toucher au moteur de déduction.
 */
export function extractSymptoms(description: string, symptoms: Symptom[]): string[] {
  const text = normalize(description);
  if (!text) return [];
  return symptoms
    .filter((s) => [s.label, ...s.synonyms].some((term) => containsTerm(text, normalize(term))))
    .map((s) => s.code);
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function containsTerm(text: string, term: string): boolean {
  if (term.length < 3) return false;
  // Limite de mot au début seulement : « bios » ne correspond pas à « symbiose »,
  // mais « chauffe » correspond à « chauffent » (tolérance aux flexions).
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}`).test(text);
}
