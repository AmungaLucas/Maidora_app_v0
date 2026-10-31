// Shared plumbing for the KYC flow (§8 / MPS §33): shell layout, labels,
// guided-capture crop math + compression, and the draft object helpers.
// Draft data travels between the KYC screens via navigation params and is
// autosaved server-side (PUT /kyc/draft) so abandonment resumes from the
// banner.
//
// 2026-10-31 — capture rebuilt around ONE screen (KycCaptureScreen) with an
// in-app guided camera (GuidedCapture). The old per-side screens + OS camera
// intent were replaced because:
//  - the three capture steps are now one checklist screen (owner request),
//  - shots are cropped to the on-screen guide frame exactly (rect for IDs,
//    oval for the selfie) instead of the free-form OS crop editor,
//  - `launchCameraAsync` (a foreign activity + `allowsEditing` editor) was
//    reloading Expo Go after every capture — the in-app CameraView never
//    leaves the app, which also fixes the "app restarts on OK" bug.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { colors, radius } from '../../theme';
import { ScreenHeader } from '../../ui';
import { api } from '../../api';
import { kycLog } from '../../kycLog';

// Flow steps after the capture consolidation: personal details, document
// type, the photos checklist (front + back + selfie on one screen), review.
export const KYC_STEPS = {
  personal: 1,
  docType: 2,
  photos: 3,
  review: 4,
};
export const KYC_TOTAL_STEPS = 4;

// Server field names (API + `kyc://field` markers) -> draft.images keys.
// The draft keeps camelCase keys (emptyDraft below); every server touchpoint
// (POST /media/kyc/:field, /kyc/images/:field, kyc:// markers) is snake_case.
// KycCaptureScreen and KycReviewScreen map through this — mixing them up is
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

// ---- draft image sources ---------------------------------------------------
// Server-stored KYC images (the `kyc://field` markers a resumed flow carries)
// are fetched through the authenticated API as base64 JSON and rendered as
// data URIs. The previous approach — Authorization headers on a raw <Image>
// source — fails SILENTLY on device (blank thumbnails after a restart, the
// first time that path is ever exercised); the fetch wrapper is proven and
// every round trip now shows up under [KYC]. Local captures (file://) and
// data URIs pass straight through, no fetch.
let imgEpoch = 0;

// Bump whenever a fresh upload lands, so a later resume never shows a stale
// cached thumbnail for a field that was just retaken.
export function bumpKycImageEpoch() {
  imgEpoch += 1;
}

const imgCache = new Map(); // `${epoch}:${field}` -> { uri: 'data:…' }

function localImageSource(marker) {
  if (marker && (/^(file|content|ph|asset):/.test(marker) || marker.startsWith('data:'))) {
    return { uri: marker };
  }
  return null; // kyc:// marker → needs the authenticated fetch below
}

export function useKycImage(marker, field, token) {
  const [source, setSource] = useState(() => localImageSource(marker));

  useEffect(() => {
    const local = localImageSource(marker);
    if (local) {
      setSource(local);
      return undefined;
    }
    if (!marker || !token) {
      setSource(null);
      return undefined;
    }
    const key = `${imgEpoch}:${field}`;
    const cached = imgCache.get(key);
    if (cached) {
      setSource(cached);
      return undefined;
    }
    setSource(null);
    let alive = true;
    (async () => {
      try {
        const res = await api.kycImageFetch(field, token);
        const src = {
          uri: `data:${(res && res.mime) || 'image/webp'};base64,${(res && res.dataBase64) || ''}`,
        };
        imgCache.set(key, src);
        if (alive) setSource(src);
      } catch (e) {
        kycLog(`image load FAILED · ${field} — ${(e && e.message) || e} (placeholder shown; re-enters the screen to retry)`);
        // source stays null — the placeholder icon shows until a re-mount
      }
    })();
    return () => {
      alive = false;
    };
  }, [marker, field, token]);

  return source;
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

// ---- guided capture / crop math --------------------------------------------
// Quality pipeline v3 (guided frames): crop to the exact guide frame,
// downscale (≤1400 px documents / ≤900 px selfie / ≤600 px avatar), encode
// WebP ~0.8. WebP roughly halves the upload size vs JPEG at the same visual
// quality — faster uploads on Kenyan mobile data and cheaper storage on the
// media subdomain. The server magic-byte sniffs every upload anyway, so a
// device that falls back to JPEG still stores correctly (extension follows
// the sniffed bytes, never the claimed mime). Blur/glare ML detection lands
// with the EAS dev build (same deferral pattern as SMS Retriever).

export async function processToWebp(picked, maxW = 1400) {
  let ref = ImageManipulator.manipulate(picked.uri);
  if ((picked.width || 0) > maxW) ref.resize({ width: maxW });
  const rendered = await ref.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.WEBP, base64: true });
  return { uri: saved.uri, base64: saved.base64, mime: 'image/webp' };
}

export function clampNum(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Map the guide-frame rect (measured in CAMERA PREVIEW coordinates) into the
// coordinate space of the captured photo. CameraView previews 'cover': when
// the photo's aspect differs from the preview's, the photo contains MORE
// than what was on screen — the visible part is a centered rect of the
// preview's aspect inside the photo. Expressing the frame in normalized
// preview coordinates and scaling it into that visible region gives the
// exact pixels the user saw inside the guide.
export function frameCropForPhoto(frame, preview, photo) {
  if (
    !frame || !preview || !photo ||
    !preview.width || !preview.height ||
    !photo.width || !photo.height ||
    !frame.width || !frame.height
  ) {
    return null;
  }
  const pa = preview.width / preview.height;
  const qa = photo.width / photo.height;
  let visW; let visH; let x0; let y0;
  if (qa > pa) {
    // Photo wider than preview → full height visible, sides cropped.
    visH = photo.height;
    visW = photo.width * (pa / qa);
    x0 = (photo.width - visW) / 2;
    y0 = 0;
  } else {
    // Photo taller than preview → full width visible, top/bottom cropped.
    visW = photo.width;
    visH = photo.height * (qa / pa);
    x0 = 0;
    y0 = (photo.height - visH) / 2;
  }
  const x = x0 + (frame.x / preview.width) * visW;
  const y = y0 + (frame.y / preview.height) * visH;
  const w = (frame.width / preview.width) * visW;
  const h = (frame.height / preview.height) * visH;
  if (![x, y, w, h].every(Number.isFinite) || w < 40 || h < 40) return null;
  return {
    originX: Math.round(clampNum(x, 0, photo.width - 1)),
    originY: Math.round(clampNum(y, 0, photo.height - 1)),
    width: Math.round(clampNum(w, 1, photo.width - x)),
    height: Math.round(clampNum(h, 1, photo.height - y)),
  };
}

// Fallback: largest centered rect with the given aspect inside the photo.
// Used for gallery picks (no preview mapping exists) and whenever the
// frame mapping degenerates.
export function centerCropForAspect(photo, aspect) {
  if (!photo || !photo.width || !photo.height || !aspect) return null;
  const qa = photo.width / photo.height;
  let w; let h;
  if (qa > aspect) {
    h = photo.height;
    w = photo.height * aspect;
  } else {
    w = photo.width;
    h = photo.width / aspect;
  }
  return {
    originX: Math.round((photo.width - w) / 2),
    originY: Math.round((photo.height - h) / 2),
    width: Math.round(w),
    height: Math.round(h),
  };
}

// Crop (optional) → optional horizontal flip → downscale → WebP.
// flipH: front-camera shots on Android store UN-mirrored while the preview
// shows the natural mirror — flip FIRST so the crop rect (computed against
// the mirrored preview) stays valid and the confirmed photo is exactly what
// the user framed (WYSIWYG). Gallery picks never flip.
export async function cropToWebp(picked, crop, maxW = 1400, flipH = false) {
  let ref = ImageManipulator.manipulate(picked.uri);
  if (flipH) ref = ref.flip({ horizontal: true });
  if (crop && crop.width > 0 && crop.height > 0) ref = ref.crop(crop);
  const w = crop ? crop.width : picked.width || 0;
  if (w > maxW) ref = ref.resize({ width: maxW });
  const rendered = await ref.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.WEBP, base64: true });
  return { uri: saved.uri, base64: saved.base64, mime: 'image/webp' };
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
