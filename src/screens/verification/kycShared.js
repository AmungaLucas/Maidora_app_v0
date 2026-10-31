// Shared plumbing for the KYC flow (§8 / MPS §33): shell layout, labels,
// image capture + compression, and the draft object helpers. Draft data
// travels between the KYC screens via navigation params and is autosaved
// server-side (PUT /kyc/draft) so abandonment resumes from the banner.
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { API_BASE_URL, colors, radius } from '../../theme';
import { ScreenHeader } from '../../ui';

export const KYC_STEPS = {
  personal: 1,
  docType: 2,
  front: 3,
  back: 4,
  selfie: 5,
  review: 6,
};
export const KYC_TOTAL_STEPS = 6;

// Server field names (API + `kyc://field` markers) -> draft.images keys.
// The draft keeps camelCase keys (emptyDraft below); every server touchpoint
// (POST /media/kyc/:field, /kyc/images/:field, kyc:// markers) is snake_case.
// DocCaptureScreen and KycReviewScreen map through this — mixing them up is
// exactly what silently hid remote images from the capture/review screens.
export const IMG_KEY = {
  id_front: 'idFront',
  id_back: 'idBack',
  selfie: 'selfie',
};

// §33.3 rejection enum -> human words (banner: "Action needed: {reason}")
export const REASON_LABELS = {
  unreadable_document: 'Unreadable document photo',
  name_mismatch: 'Name does not match your ID',
  expired_document: 'Document has expired',
  selfie_mismatch: 'Selfie does not match your ID',
  suspected_fraud: 'We could not verify this submission',
  other: 'Your submission needs attention',
};

export const ID_TYPE_LABELS = {
  national_id: 'National ID',
  passport: 'Passport',
  drivers_license: "Driver's license",
};

export function emptyDraft() {
  return {
    fullNameAsOnId: '',
    idNumber: '',
    idType: null,
    dateOfBirth: '', // stored as YYYY-MM-DD
    gender: null, // optional; null = withheld
    images: { idFront: null, idBack: null, selfie: null }, // local or remote URIs
    urgent: false,
  };
}

// Draft arriving either from KycIntro (server fields + image flags) or from
// a previous KYC screen (local captures). Image URIs from the server are
// authenticated endpoints; fresh captures are local file URIs.
export function normalizeDraft(p) {
  const d = { ...emptyDraft(), ...(p || {}) };
  d.images = { ...emptyDraft().images, ...(p && p.images) };
  return d;
}

// RN Image source for a draft image URI — freshly captured files load
// locally; the `kyc://field` marker (image exists server-side) streams from
// the authenticated /kyc/images/:field route with the bearer token.
export function kycImageSource(uri, field, token) {
  if (!uri) return null;
  if (/^(file|content|ph|asset):/.test(uri) || uri.startsWith('data:')) {
    return { uri };
  }
  return { uri: `${API_BASE_URL}/kyc/images/${field}`, headers: { Authorization: `Bearer ${token}` } };
}

export function calcAge(dobYyyyMmDd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobYyyyMmDd || '');
  if (!m) return null;
  const dob = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(dob.getTime()) || dob.getUTCFullYear() !== +m[1]) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const mm = now.getUTCMonth() - dob.getUTCMonth();
  if (mm < 0 || (mm === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

// Accepts what the user typed in the DOB field (DD-MM-YYYY or YYYY-MM-DD)
// and normalises to YYYY-MM-DD, or null when it cannot be parsed.
export function normalizeDobInput(raw) {
  const s = String(raw || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso || '';
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---- image capture ---------------------------------------------------------
// v2 quality pipeline: crop (allowsEditing), downscale (≤1400 px documents /
// ≤900 px selfie), encode WebP ~0.8. WebP roughly halves the upload size vs
// JPEG at the same visual quality — faster uploads on Kenyan mobile data and
// cheaper storage on the media subdomain. The server magic-byte sniffs every
// upload anyway, so a device that falls back to JPEG still stores correctly
// (extension follows the sniffed bytes, never the claimed mime). Blur/glare
// ML detection lands with the EAS dev build (same deferral pattern as SMS
// Retriever — zero-native layers ship today).

export async function processToWebp(picked, maxW = 1400) {
  let ref = ImageManipulator.manipulate(picked.uri);
  if ((picked.width || 0) > maxW) ref.resize({ width: maxW });
  const rendered = await ref.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.WEBP, base64: true });
  return { uri: saved.uri, base64: saved.base64, mime: 'image/webp' };
}

// JPEG fallback retained for callers that specifically need JPEG.
export async function processToJpeg(picked, maxW = 1400) {
  let ref = ImageManipulator.manipulate(picked.uri);
  if ((picked.width || 0) > maxW) ref.resize({ width: maxW });
  const rendered = await ref.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.78, format: SaveFormat.JPEG, base64: true });
  return { uri: saved.uri, base64: saved.base64, mime: 'image/jpeg' };
}

async function ensureCameraPermission() {
  const { granted, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
  if (granted) return true;
  Alert.alert(
    'Camera needed',
    canAskAgain
      ? 'Allow Maidora to use your camera to capture your document.'
      : 'Camera access is off for Maidora. Enable it in Settings to continue.'
  );
  return false;
}

async function ensureLibraryPermission() {
  const { granted, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (granted) return true;
  Alert.alert(
    'Photos needed',
    canAskAgain
      ? 'Allow Maidora to access your photos to upload your document.'
      : 'Photo access is off for Maidora. Enable it in Settings to continue.'
  );
  return false;
}

// Document capture: camera or gallery, cropped to an ID-card-ish frame.
export async function captureDocument() {
  return new Promise((resolve) => {
    Alert.alert('Add photo', 'How would you like to add it?', [
      {
        text: 'Take photo',
        onPress: async () => {
          if (!(await ensureCameraPermission())) return resolve(null);
          const r = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [16, 10],
            quality: 0.85,
          });
          if (r.canceled || !r.assets?.length) return resolve(null);
          resolve(await processToWebp(r.assets[0]));
        },
      },
      {
        text: 'Choose from gallery',
        onPress: async () => {
          if (!(await ensureLibraryPermission())) return resolve(null);
          const r = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [16, 10],
            quality: 0.85,
          });
          if (r.canceled || !r.assets?.length) return resolve(null);
          resolve(await processToWebp(r.assets[0]));
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

// Selfie: live capture only (§33.1 step 6 — no gallery), front camera, square.
export async function captureSelfie() {
  if (!(await ensureCameraPermission())) return null;
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    cameraType: ImagePicker.CameraType.front,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });
  if (r.canceled || !r.assets?.length) return null;
  return processToWebp(r.assets[0], 900);
}

// ---- shell -----------------------------------------------------------------
export function KycShell({ step, title, subtitle, children }) {
  return (
    <View style={s.flex}>
      <View style={s.progressWrap}>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${Math.round((step / KYC_TOTAL_STEPS) * 100)}%` }]} />
        </View>
        <Text style={s.progressText}>Step {step} of {KYC_TOTAL_STEPS}</Text>
      </View>
      <ScreenHeader eyebrow="Identity verification" title={title} subtitle={subtitle} />
      {children}
    </View>
  );
}

export function InfoRow({ icon, text }) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={18} color={colors.forest} />
      <Text style={s.infoText}>{text}</Text>
    </View>
  );
}

export function OptionCard({ selected, onPress, title, body, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.optionCard, selected && s.optionCardSelected, pressed && { opacity: 0.85 }]}
    >
      <View style={s.optionIconWrap}>
        <Ionicons name={icon} size={22} color={selected ? colors.cream : colors.forest} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.optionTitle, selected && { color: colors.cream }]}>{title}</Text>
        {body ? <Text style={[s.optionBody, selected && { color: colors.brandSoftLight }]}>{body}</Text> : null}
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? colors.cream : colors.line}
      />
    </Pressable>
  );
}

export const s = StyleSheet.create({
  flex: { flex: 1 },
  progressWrap: { marginBottom: 14, gap: 6 },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(33, 78, 59, 0.12)',
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.forest },
  progressText: { fontSize: 12, color: colors.muted, alignSelf: 'flex-end' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  infoText: { flex: 1, fontSize: 14, color: colors.ink, lineHeight: 20 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
  },
  optionCardSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(214, 166, 79, 0.16)',
  },
  optionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  optionBody: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  // capture screen
  captureFrame: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
    marginBottom: 16,
  },
  capturePreview: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  captureTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  captureBody: { fontSize: 13.5, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  tipsCard: {
    backgroundColor: 'rgba(214, 166, 79, 0.12)',
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 16,
    gap: 4,
  },
  tipsTitle: { fontSize: 12.5, fontWeight: '800', color: colors.goldDark },
  tipsText: { fontSize: 12.5, color: colors.ink, lineHeight: 18 },
  // review
  reviewCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  reviewLabel: { fontSize: 13, color: colors.muted },
  reviewValue: { fontSize: 14, fontWeight: '600', color: colors.ink, maxWidth: '55%', textAlign: 'right' },
  reviewDivider: { height: 1, backgroundColor: colors.line },
  reviewImgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  reviewThumb: { width: 74, height: 50, borderRadius: 8, backgroundColor: 'rgba(33,78,59,0.08)' },
  reviewThumbSelfie: { width: 50, height: 50, borderRadius: 25 },
  retakeLink: { fontSize: 13, fontWeight: '700', color: colors.forest },
});
