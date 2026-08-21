export const DEFAULT_PROGRAM_TERMS =
  "Un point est accordé par achat éligible. Le commerçant peut annuler tout point attribué par erreur ou de manière frauduleuse.";

export const LEGACY_PROGRAM_TERMS = "Une visite par jour et par client.";

export const PROGRAM_COLORS = [
  { value: "#f05b3c", name: "Corail" },
  { value: "#2b6e5c", name: "Forêt" },
  { value: "#2563eb", name: "Azur" },
  { value: "#4338ca", name: "Indigo" },
  { value: "#5e45b8", name: "Violet" },
  { value: "#7e22ce", name: "Prune" },
  { value: "#be185d", name: "Framboise" },
  { value: "#bd7a19", name: "Ambre" },
  { value: "#047857", name: "Émeraude" },
  { value: "#0f766e", name: "Canard" },
  { value: "#334155", name: "Ardoise" },
  { value: "#171714", name: "Noir" },
] as const;

export function visibleProgramTerms(value?: string | null) {
  const normalized = value?.trim();
  return !normalized || normalized === LEGACY_PROGRAM_TERMS ? DEFAULT_PROGRAM_TERMS : normalized;
}

