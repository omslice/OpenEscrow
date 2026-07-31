export type AgreementPanel = "summary" | "funds" | "claims";

export const AGREEMENT_PANELS: readonly AgreementPanel[] = [
  "summary",
  "funds",
  "claims",
];

export function rememberAgreementPanel(
  visited: readonly AgreementPanel[],
  panel: AgreementPanel,
): readonly AgreementPanel[] {
  return visited.includes(panel) ? visited : [...visited, panel];
}

export function shouldLoadAgreementPanel(
  panel: AgreementPanel,
  selectedPanel: AgreementPanel,
  visited: readonly AgreementPanel[],
) {
  return panel === selectedPanel || visited.includes(panel);
}
