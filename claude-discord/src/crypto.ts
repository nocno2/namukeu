import { createDecipheriv } from "crypto";

/**
 * Decrypt an AES-256-CBC encrypted string.
 * Format: <iv_hex>:<ciphertext_hex>
 */
export function decrypt(encrypted: string, keyHex: string): string {
  const [ivHex, cipherHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const key = Buffer.from(keyHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
