import DocCaptureScreen from './DocCaptureScreen';

// KYC step 3 — document front (§33.1 step 4).
export default function KycDocFrontScreen(props) {
  return <DocCaptureScreen {...props} field="id_front" />;
}
