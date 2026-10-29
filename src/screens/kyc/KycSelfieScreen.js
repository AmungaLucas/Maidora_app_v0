import DocCaptureScreen from './DocCaptureScreen';

// KYC step 5 — live selfie (§33.1 step 6). Camera-only: no gallery option.
export default function KycSelfieScreen(props) {
  return <DocCaptureScreen {...props} field="selfie" />;
}
