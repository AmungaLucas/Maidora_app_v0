import DocCaptureScreen from './DocCaptureScreen';

// KYC step 4 — document back (§33.1 step 5). Collected for national ID and
// driver's license; the flow skips this screen for passports. (The server
// submit gate *requires* the back for national_id per spec; license back is
// collected as extra evidence.)
export default function KycDocBackScreen(props) {
  return <DocCaptureScreen {...props} field="id_back" />;
}
