import type { Question } from "./ctf-activity";

// Distractors are deliberate misconceptions, not randomly invented evidence.
const distractors: Record<number, string[]> = {
  4: [".xml", ".ufdr", ".json"],
  5: ["Set Visible to Yes", "Set Required to No", "Add a default value without requiring completion"],
  8: ["Media classification", "Malware scan", "Watchlist keyword search"],
  9: ["1", "3", "4"],
  20: ["Analyzed Data > Instant Messages > Keywords", "File Systems > WatchList > Keywords", "Insights > Media Classification"],
  26: ["Microsoft Defender", "ClamAV", "Sophos"],
  27: ["signatures.db", "definitions32.msd", "malware_rules.xml"],
  29: ["File > Report settings", "Tools > Settings > Additional Report Fields", "View > Manage Projects"],
  31: ["145988", "1459986", "14598860"],
  33: ["6", "8", "14"],
  34: ["AddressBook.sqlitedb", "Calendar.sqlitedb", "Photos.sqlite"],
  35: ["chat", "handle", "attachment"],
  38: ["Hex", "Table", "Timeline"],
  41: ["ZASSET", "ZCLOUDMASTER", "ZCLOUDRESOURCE"],
  44: ["charlie", "meridian", "backup"],
  58: ["Tools > Get more data (Carving) > Carve Images", "Tools > Manage Tags > Classify media", "File > Report > Media classification"],
  59: ["Analyzed Data > Images > Classified", "File Systems > Media Classification", "Insights > WatchList > Keywords"],
  63: ["File > Add external file > Map tiles", "Tools > Settings > Online maps", "View > Maps > Download live tiles"],
  64: ["GPX (tracks); Notepad", "CSV (table); Hasher", "UFDR (report); SQLite Wizard"],
  67: ["Tools > Manage Tags; or open the Table view and select Manage Tags", "File > Add external file; or open the Hex view and select File Info", "Plug-ins > Chain Manager; or open the Table view and select Chain Manager"],
  70: ["ZORIGINALFILENAME", "ZCREATIONDATE", "ZIMPORTDATE"],
  72: ["5", "20", "100"],
  73: ["Analyzed Data > Images", "Insights > WatchList", "File Systems > Raw Data"],
  75: ["ZBODY > Z_PK > ZUSER > ZUSERNAME", "ZUSERNAME > ZUSER > Z_PK > ZBODY", "ZBODY > ZUSER > ZUSERNAME > Z_PK"],
  78: ["File > Open extraction", "Tools > Manage Tags", "Edit case > Remove evidence"],
  80: ["CAFEBABE", "FEEDFACE", "BAADF00D"],
  81: ["4445414442454547", "DEADBEEF", "44454144424545"],
  82: ["36", "40", "76"],
  83: ["70", "160", "280"],
  84: ["0x00", "0x20", "0xFE"],
  85: ["+17106960418", "+17609606184", "+1760960614"],
  87: ["+17106992618", "+17609962815", "+1760996218"],
  88: ["Strings > 8 Bit > Normal > 0 bits offset", "Strings > 7 Bit > Reversed > 0 bits offset", "Date & Time > Generic > PDU SMS time"],
  89: ["Date & Time > Unix > Seconds", "Date & Time > Apple > Absolute Time", "Strings > 7 Bit > Normal > 0 bits offset"],
  92: ["14 July 2014 at 1202 (12:02 PM)", "14 July 2014 at 0020 (12:20 AM)", "14 June 2014 at 1220 (12:20 PM)"],
  93: ["Tools > Enrichment engines > Media classification", "File > Add external file", "Tools > Manage Tags > Images"],
  96: ["Images > Classified Media", "Insights > WatchList", "Deleted Files"],
  97: ["89504E47 = PNG", "47494638 = GIF8", "504B0304 = ZIP"],
  99: ["[0-9]+@[0-9]+", "[a-zA-Z0-9._%+-]+#[a-zA-Z0-9.-]+", "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\[0-9]{2,4}"],
  103: ["Tools > Manage Tags", "File > Report settings", "Tools > Enrichment engines"],
  105: ["Samsung MCU v1 - Contacts Only", "Generic Android - Logical", "Apple iOS - File System"],
  111: ["RSA", "DES", "SHA-256"],
  113: ["UFED Reader", "Hasher", "ExifTool"],
  114: ["Tags Only PDF", "Full UFDR Report", "Excel Table Export"],
};

const prompts: Record<number, string> = {
  4: "Distinguish a settings export from an evidence container or report. Inspect the exported configuration file's extension.",
  5: "A visible field or a prefilled value does not necessarily block report creation. Review the field's completion requirement.",
  8: "Consider which process needs raw-file metadata during ingest rather than operating on records already decoded.",
  9: "Count the extraction entries in Extraction Summary, not the number of devices or decoded categories.",
  20: "Follow the project-tree branch created by the watchlist run. Do not confuse search results with media-classification results.",
  26: "Check the product's malware-scanning engine, not the antivirus installed on the workstation.",
  27: "Inspect the supplied offline update file and its architecture. Do not infer the filename from a different antivirus product.",
  29: "Look for the function that manages tag definitions and hotkeys, not reporting fields or project layout.",
  31: "Read the exact byte count for the specified image. Avoid rounded file sizes and check for a missing or extra digit.",
  33: "Count messages in the specified thread, not contacts, attachments, or all conversations combined.",
  34: "Identify the application database that stores the native message records, rather than a contacts, calendar, or media database.",
  35: "Distinguish the table containing the text bodies from tables for participants, conversations, or attachments.",
  38: "Choose the view showing file metadata suitable for comparison with an external metadata tool.",
  41: "Inspect the schema and locate the requested coordinate columns. A related image table is not necessarily the coordinate source.",
  44: "Check the supplied training backup's opening instructions. The case name and device label are not necessarily its password.",
  58: "Separate running a classification engine from carving images, tagging records, or producing a report.",
  59: "Look for the classification results branch, rather than the source image category or keyword-match branch.",
  63: "This workstation cannot download live map tiles. Review the supported offline-package installation workflow.",
  64: "Match a geographic export format to a mapping application, rather than a table viewer or a forensic report reader.",
  67: "Look for a query-building workflow that can be opened from the application menu or the database table view.",
  70: "A primary key uniquely identifies a row. Filenames and timestamps may be useful fields without being the primary key.",
  72: "Check the preview's default row limit rather than the total number of rows in the source table.",
  73: "Locate the category created by your generic model mapping, not the original parsed category or a watchlist result.",
  75: "Trace the displayed username through the referenced user identifier to the message body. Check the join direction at each step.",
  78: "The spreadsheet must be brought back as an external case item; opening an extraction or managing tags is a different operation.",
  80: "Inspect the literal ASCII marker repeated in the provided memory image; do not substitute a familiar hexadecimal sentinel.",
  81: "Convert each character of the ASCII marker into its own byte. A marker that looks hexadecimal is not necessarily entered as raw hex.",
  82: "Measure the offset from the end of the marker using the byte layout, not from the beginning of the record.",
  83: "Distinguish the body's byte capacity from character capacity and from the size of an entire record.",
  84: "Inspect the repeating padding bytes at the end of the highlighted range. Exclude padding before decoding the message.",
  85: "Use the address length and international-format indicator, then swap the digit nibbles and remove filler. Check digit order and count.",
  87: "Apply the address-length and semi-octet decoding rules again. Do not copy the earlier phone number or retain the filler nibble.",
  88: "Check the text encoding, direction, and bit offset for the selected message-body bytes.",
  89: "Use the recovered timestamp's actual encoding rather than assuming it is Unix or Apple time.",
  92: "Verify the day, month, and AM/PM interpretation against the decoded record. Do not confuse the displayed format with a different time.",
  93: "Distinguish recovering image files from classifying existing media or adding an external file.",
  96: "Inspect where the carving operation placed newly recovered items, not where normal parsing or classification places images.",
  97: "Translate the bytes into ASCII and check that both the hexadecimal marker and its interpretation refer to the requested image type.",
  99: "An email pattern must match a local part, an address separator, a domain, and a literal dot before the final domain suffix. Check escaping and character classes.",
  103: "Look for plug-in chain composition, not tagging, enrichment, or report configuration.",
  105: "Match the chain to the supplied dump's device family, MCU format, version, and requested content scope.",
  111: "Separate encryption standards from hashing functions and from asymmetric key algorithms.",
  113: "Distinguish the analytical destination from the report reader and standalone verification utilities.",
  114: "Choose a product matching the requested limited scope and time constraint, rather than a complete evidence release or a tagged-findings report.",
};
const sectionFeedback: Record<number, string> = {
  1: "Repeat the specified workstation or case-build action and inspect the relevant setting. Distinguish configuration, processing, and report controls.",
  2: "Check ALPHA, the requested artifact category, and any filters before comparing results. Distinguish original records from enrichments and grouped totals.",
  3: "Return to BRAVO's source artifact and independently validate the decoded value. Pay attention to table fields, units, timestamps, and time zones.",
  4: "Check CHARLIE's exact device or artifact property and the tool's relevant output. Do not substitute assumptions based on a different device.",
  5: "Inspect the actual database schema and query output. Check source columns, join direction, row limits, and how the model is mapped.",
  6: "Check the raw-byte structure, selected range, encoding, and offsets. Distinguish a byte value from the text or timestamp it represents.",
  7: "Compare the supplied dump with the chain's supported device and data format, then validate the resulting records.",
  8: "Match the report's audience, scope, and protection requirements. Distinguish creating a product from validating or protecting it.",
};

const normalized = (s: string) => s.normalize("NFKC").toLowerCase().replace(/authorized/g, "authorised").replace(/[^a-z0-9]/g, "");
function ordered(id: number, options: string[]) {
  // Stable but not answer-first; the grading key stays on the server.
  const result = [...options];
  let seed = (id * 2654435761) >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function withObjectiveChoices(q: Question): Question {
  const feedback = prompts[q.id] ?? sectionFeedback[q.section];
  if (q.category !== "auto" || !["short", "number"].includes(q.kind) || !distractors[q.id]) return { ...q, incorrectFeedback: feedback };
  return {
    ...q, kind: "single",
    validationMode: q.validationMode ?? (q.kind === "number" ? "numeric" : q.id === 99 ? "exact" : "normalised"),
    options: ordered(q.id, [q.acceptedAnswers[0], ...distractors[q.id]]),
    incorrectFeedback: feedback,
  };
}

export function withClassroomChoices(q: Question, accepted: string[] = []): Question {
  // These questions are counts or a categorical color, not written analysis,
  // hashes, timestamps, actual artifact text, or learner-generated products.
  if (q.category !== "dataset" || q.validationMode === "manual" || [117, 118].includes(q.id) || !accepted.length || !["number", "short"].includes(q.kind)) return q;
  const numeric = q.kind === "number" || q.validationMode === "numeric" || (/\bhow many\b/i.test(q.prompt) && /^\d[\d,]*$/.test(accepted[0]));
  if (numeric) {
    const n = Number(accepted[0].replace(/,/g, "").trim());
    if (!Number.isSafeInteger(n) || n < 0) return q;
    const valid = new Set(accepted.map(a => Number(a.replace(/,/g, "").trim())));
    const decoys = [n + 1, n - 1, n + 2, n - 2, n + 5].filter(v => Number.isSafeInteger(v) && v >= 0 && !valid.has(v)).slice(0, 3);
    if (decoys.length !== 3) return q;
    return { ...q, kind: "single", options: ordered(q.id, [String(n), ...decoys.map(String)]) };
  }
  if (q.id === 11) {
    const keys = new Set(accepted.map(normalized));
    const decoys = ["Blue", "Green", "Red", "Yellow", "Purple", "Orange"].filter(v => !keys.has(normalized(v))).slice(0, 3);
    return { ...q, kind: "single", options: ordered(q.id, [accepted[0], ...decoys]) };
  }
  return q;
}
