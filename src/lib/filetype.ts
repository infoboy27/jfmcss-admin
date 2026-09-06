/**
 * Magic-byte sniffing for uploads — the client-supplied `file.type` is a hint,
 * not a fact. Returns true when the first bytes are consistent with `declared`.
 * `text/plain` can't be sniffed so it's accepted if the sample has no NUL byte.
 */
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // docx / xlsx are zip containers
const SIGS: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => b.slice(0, 5).toString("latin1") === "%PDF-",
  "image/png": (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b) => ZIP.every((v, i) => b[i] === v),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b) => ZIP.every((v, i) => b[i] === v),
  "text/plain": (b) => !b.subarray(0, 4096).includes(0x00),
};

export function contentMatchesType(sample: Buffer, declared: string): boolean {
  const check = SIGS[declared];
  return check ? check(sample) : false;
}
