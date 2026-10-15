import { Assignment, assignmentToJson, decodeAssignment, encodeAssignment, fromBase64Url, parseAssignmentJson, toBase64Url } from "../core";

/**
 * Work packages in links. Plain form: "j" + base64url JSON. Compressed form: "z" + base64url of the deflated JSON,
 * used when the browser can compress and it makes the link shorter (a package of fifty races is about a third smaller).
 */

async function streamBytes(input: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // a failure shows up when the result is read; catching here only avoids a second, unhandled report of it
  writer.write(input as unknown as BufferSource).catch(() => undefined);
  writer.close().catch(() => undefined);
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function packAssignment(a: Assignment): Promise<string> {
  const plain = "j" + encodeAssignment(a);
  if (typeof CompressionStream === "undefined") return plain;
  try {
    const z = "z" + toBase64Url(await streamBytes(new TextEncoder().encode(assignmentToJson(a)), new CompressionStream("deflate-raw")));
    return z.length < plain.length ? z : plain;
  } catch {
    return plain;
  }
}

export async function unpackAssignment(text: string): Promise<Assignment> {
  const t = text.trim();
  if (t.startsWith("z")) {
    if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot open this link: try a current Chrome, Edge or Firefox");
    try {
      const bytes = await streamBytes(fromBase64Url(t.slice(1)), new DecompressionStream("deflate-raw"));
      return parseAssignmentJson(new TextDecoder().decode(bytes));
    } catch (e) {
      if (e instanceof Error && /Pelotonic|no races/.test(e.message)) throw e;
      throw new Error("this link's work package cannot be read: ask for a new link");
    }
  }
  return decodeAssignment(t.startsWith("j") ? t.slice(1) : t);
}
