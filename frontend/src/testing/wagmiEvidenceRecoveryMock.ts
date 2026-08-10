const SUBMITTER = "0x1111111111111111111111111111111111111111" as const;

const evidence = [
  {
    contentHash: `0x${"a".repeat(64)}` as const,
    uri: "openescrow://evidence/018f4f6a-3f9d-7a21-a48d-123456789abc",
    evidenceType: 10,
    timestamp: 1_750_000_000n,
    submittedBy: SUBMITTER,
  },
  {
    contentHash: `0x${"b".repeat(64)}` as const,
    uri: "https://example.test/supporting-document.pdf",
    evidenceType: 99,
    timestamp: 1_750_000_100n,
    submittedBy: SUBMITTER,
  },
];

export function useReadContract() {
  return { data: evidence };
}
