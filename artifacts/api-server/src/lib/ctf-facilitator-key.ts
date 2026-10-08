import type { Question } from "./ctf-activity";

// These references stay on the server and in the authenticated instructor catalog.
// The guide explicitly requires dataset values to be verified on the classroom build.
const referenceAnswers: Record<number, string[]> = {
  10: ["4/6/2022 12:14:48 PM (-0400)", "2022-04-06 12:14:48 -0400"],
  13: ["8"],
  14: ["81"],
  15: ["dcheat425"],
  16: ["Over_the_Horizon.mp3"],
  17: ["3729"],
  18: ["23135"],
  19: ["29"],
  23: ["53"],
  32: ["638FFDCD3F2FFECCBB0483B6B94F5834; Match", "638FFDCD3F2FFECCBB0483B6B94F5834; Yes, it matches"],
  37: ["Hey is this j?; 2/28/2022 6:11:12 PM UTC", "Hey is this j?; 2022-02-28 18:11:12 UTC"],
  40: ["2022-04-03 13:20:00; Yes", "2022-04-03 13:20:00; Match"],
  42: ["IMG_0006.heic (DCIM); 005.jpg; IMG_0006.heic (SMS)", "Original: IMG_0006.heic (DCIM); Thumbnail: 005.jpg; Altered: IMG_0006.heic (SMS)"],
  46: ["034FA1357B64"],
  47: ["iPhone 12 Mini", "iPhone13,1"],
  48: ["Forever", "Keep Forever", "Indefinitely"],
  49: ["(UTC-08:00) Los_Angeles", "UTC-08:00 Los Angeles", "America/Los_Angeles"],
  50: ["Yes"],
  52: ["Yes"],
  53: ["Yes"],
  55: ["Photos.sqlite"],
  56: ["87"],
  57: ["Yes"],
  60: ["33"],
};

const notes: Record<number, string> = {
  10: "Confirm the extraction END time and project time zone. The guide records 6 April 2022, 12:14:48 PM, UTC-04:00.",
  16: "Verify the actual largest audio file and its filename on ALPHA before accepting this reference.",
  17: "Timeline counts vary by software version. Clear unrelated filters and verify the classroom count.",
  18: "The question asks for unique images: the reference is 23,135 after deduplication. 23,929 includes duplicates and is not the unique-image key.",
  23: "Confirm the supplied hash set, selected extraction and completed scan before saving 53.",
  28: "No reliable malware detection count is supplied. The facilitator's menu-route answer is not a valid answer to this count question. Run the classroom scan and enter the observed count.",
  31: "The complete activity names Img_0003.HEIC; the shorter facilitator guide names Img_0049.PNG. Verify that the keyed size of 2,553,875 bytes belongs to the classroom file named in this question.",
  32: "Confirm the MD5 of Img_0003.HEIC itself. Do not borrow a hash from a differently named image in the shorter guide.",
  37: "Verify the first message in the requested Rigoberto thread and the displayed/converted time zone, not another message thread.",
  40: "The question requests Apple Absolute Time (UTC) while the DCode setup uses UTC-07:00 Arizona. Verify the UTC value and comparison on the classroom build.",
  42: "The complete activity names the thumbnail 005.jpg; the shorter guide says 5005.JPG. This reference uses the activity's filename. Confirm all three files, roles, hashes and paths before saving.",
  47: "The guide identifies iPhone 12 Mini (internal identifier iPhone13,1), despite the older roster naming iPhone 5S. Verify the actual device and decide which identifiers to accept.",
  51: "Manually verify five distinct messaging apps from the actual extraction. The guide lists Kakao Talk, Kik, Skype, Viber, WhatsApp, native Messages, Facebook, Instagram, Telegram, Twitter, Snapchat and Line.",
  54: "Manually verify all five parties, regardless of order or phone-number formatting. The guide lists +15092631653, Chuck Waggon, +15092166844, Bobby Smith and Doc Brown.",
  60: "33 is a recorded reference, not a universal count. Wait for classification to finish and verify the software version and selected categories.",
  61: "Full credit requires two named items, a plausible classifier rationale and an explicit exclusion decision. Naming items without explaining the error earns partial credit; vague claims of false positives do not.",
  66: "The application and recovered artifact depend on the classroom image and AppGenie version. Review an evidenced application/artifact pair rather than accepting an arbitrary app name.",
  100: "This question asks for every unique email address on FOXTROT—not an email count on ALPHA. The five-section guide's value of 35 must not be imported as this answer.",
  117: "Review against this learner's own tags and report; there is no shared numeric answer.",
  118: "Require the learner's actual UFDR filename plus AES and/or password protection. There is no shared filename.",
  120: "Score four blocks of ten: directing individual supported across devices; communications means with an artifact citation; device/artifact/Inseyets.PA location for each assertion; three findings independently validated through a second tool or raw database. Do not reward unsupported speculation.",
};

const variants: Record<number, string[]> = {
  5: ["Required = Yes", "Required yes", "Yes", "Make the field required", "Set the field to required"],
  24: ["Insights > Hash sets", "Insights > Hash sets > assigned hash set", "Insights > Hash sets > hash set name"],
  35: ["message", "message (80)"],
  38: ["File Info", "File Information", "File Info window", "File Information window"],
  64: ["KML", ".kml", "KML (locations)", "KML locations"],
  67: ["Tools > SQLite Wizard; Table view > SQLite Wizard icon", "Tools > SQLite Wizard and Table view > SQLite Wizard icon", "Tools > SQLite Wizard; Database Table view > SQLite Wizard icon"],
  73: ["Analyzed Data > Manual Data Collection"],
  86: ["0B = 11 digits; 91 = international format", "0B means 11 digits; 91 means international format"],
  88: ["Values > Strings > 7 Bit > Normal > 0 bits offset"],
  89: ["Values > Date & Time > Generic > PDU SMS time", "Date and Time > Generic > PDU SMS time"],
  92: ["14 July 2014 12:20 PM", "14 July 2014 12:20", "2014-07-14 12:20", "2014-07-14 12:20:00", "July 14 2014 at 12:20 PM"],
  96: ["Analyzed Data > Manual Evidence"],
  97: ["0x4A464946 = JFIF", "4A464946 (JFIF)"],
  103: ["Plug-ins > Chain Manager", "Plug-ins menu > Chain Manager"],
};

export function applyFacilitatorKey(original: Question): Question {
  const q = { ...original };
  if (q.category === "auto" && q.kind === "short" && variants[q.id]) {
    q.acceptedAnswers = [...new Set([...q.acceptedAnswers, ...variants[q.id]])];
  }
  if (q.id === 36) {
    q.prompt = "In BRAVO's sms.db message table, what unit and epoch are used to encode the message timestamps?";
    q.options = ["Seconds since Unix UTC 1970", "Nanoseconds since UTC 2001", "Milliseconds in the analyst workstation time zone", "Seconds in the carrier network time"];
    q.acceptedAnswers = ["Nanoseconds since UTC 2001"];
    q.validationMethod = "The complete facilitator guide, Flag 3-7, specifies nanoseconds since UTC 2001. The older generic UTC-only validation note is superseded.";
  }
  if (q.id === 47) {
    q.prompt = "Identify CHARLIE's handset model using its marketing model name or internal iPhone model identifier. Verify the device information rather than relying solely on the extraction filename.";
  }
  // List findings and student-specific products need evidence-based review.
  if ([51, 54, 66, 117, 118].includes(q.id)) {
    q.validationMode = "manual";
    q.category = "manual";
    q.acceptedAnswers = [];
  }
  if (q.category === "dataset" && referenceAnswers[q.id]) {
    q.facilitatorAnswers = referenceAnswers[q.id];
  }
  if (notes[q.id]) q.facilitatorNote = notes[q.id];
  return q;
}
