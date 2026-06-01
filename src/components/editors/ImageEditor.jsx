"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useCmsContext } from "../../lib/context.js";
import { fieldStyle, labelStyle, labelTextStyle } from "./styles.js";

const ACCENT = "#c9b896";
const BORDER = "rgba(255,255,255,0.10)";
const BORDER_ACCENT = "rgba(201,184,150,0.50)";
const TEXT_MUTED = "rgba(255,255,255,0.40)";
const TEXT_FAINT = "rgba(255,255,255,0.25)";

/**
 * @typedef {Object} ImageValue
 * @property {string} src
 * @property {string} alt
 */

/**
 * @param {Object} props
 * @param {ImageValue|null|undefined} props.value
 * @param {(value: ImageValue) => void} props.onChange
 */
export function ImageEditor({ value, onChange }) {
  const { config, getAccessToken } = useCmsContext();
  const src = value?.src ?? "";
  const alt = value?.alt ?? "";

  const [isDragging, setIsDragging] = useState(false);
  /** @type {[{ progress: number }|{ error: string }|null, React.Dispatch<any>]} */
  const [uploadState, setUploadState] = useState(null);
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null));

  /** @param {Partial<ImageValue>} p */
  const patch = (p) => onChange({ src, alt, ...p });

  const handleFile = useCallback(
    /** @param {File} file */
    async (file) => {
      if (!file.type.startsWith("image/")) {
        setUploadState({ error: "Lütfen bir görsel dosyası seçin." });
        return;
      }
      setUploadState({ progress: 0 });
      try {
        const token = (await getAccessToken?.()) ?? null;
        const result = await config.transport.uploadImage(file, {
          onProgress: (p) => setUploadState({ progress: p }),
          accessToken: token,
        });
        const url = result?.data?.url;
        if (!url) throw new Error("CDN cevabında url bulunamadı");
        onChange({ src: url, alt });
        setUploadState(null);
      } catch (/** @type {any} */ err) {
        setUploadState({ error: err.message ?? "Yükleme başarısız." });
      }
    },
    [config, getAccessToken, onChange, alt],
  );

  const onDrop = useCallback(
    /** @param {React.DragEvent} e */
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const isUploading = uploadState !== null && "progress" in uploadState;
  const uploadError = uploadState !== null && "error" in uploadState ? uploadState.error : null;
  const progress = isUploading ? /** @type {any} */ (uploadState).progress : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Drop zone / preview */}
      <div
        style={{ position: "relative", borderRadius: 10 }}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
      >
        {src && !isUploading ? (
          <div style={{ position: "relative" }}>
            <img
              src={src}
              alt={alt}
              style={{
                width: "100%",
                maxHeight: 180,
                objectFit: "contain",
                display: "block",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 10,
                border: `1px solid ${BORDER}`,
              }}
            />

            {/* Drag-over overlay on existing image */}
            <AnimatePresence>
              {isDragging && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(21,17,13,0.80)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    border: `2px dashed ${BORDER_ACCENT}`,
                    color: ACCENT,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    gap: 6,
                  }}
                >
                  <UploadIcon color={ACCENT} size={16} />
                  Görseli bırak
                </motion.div>
              )}
            </AnimatePresence>

            {/* Replace button */}
            <button
              type="button"
              className="inscribed-img-replace"
              onClick={() => inputRef.current?.click()}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "rgba(21,17,13,0.82)",
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                color: "rgba(255,255,255,0.75)",
                fontSize: 11,
                padding: "4px 10px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontWeight: 500,
                backdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <UploadIcon size={11} color="currentColor" />
              Değiştir
            </button>
          </div>
        ) : (
          /* Empty upload zone */
          <motion.button
            type="button"
            animate={{
              borderColor: isDragging ? BORDER_ACCENT : isUploading ? "rgba(201,184,150,0.30)" : BORDER,
              background: isDragging
                ? "rgba(201,184,150,0.06)"
                : isUploading
                  ? "rgba(201,184,150,0.03)"
                  : "rgba(255,255,255,0.02)",
            }}
            transition={{ duration: 0.18 }}
            onClick={() => !isUploading && inputRef.current?.click()}
            style={{
              width: "100%",
              minHeight: 112,
              border: `1.5px dashed ${BORDER}`,
              borderRadius: 10,
              cursor: isUploading ? "default" : "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "16px 14px",
              fontFamily: "inherit",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isUploading ? (
                <motion.div
                  key="uploading"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}
                >
                  {/* Progress bar */}
                  <div style={{
                    width: "80%",
                    height: 3,
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 99,
                    overflow: "hidden",
                  }}>
                    <motion.div
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      style={{
                        height: "100%",
                        background: `linear-gradient(90deg, rgba(201,184,150,0.5), ${ACCENT})`,
                        borderRadius: 99,
                      }}
                    />
                  </div>

                  {/* Status + percentage */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 400 }}>
                      {progress < 100 ? "Yükleniyor" : "İşleniyor…"}
                    </span>
                    {progress < 100 && (
                      <span style={{ fontSize: 11, color: ACCENT, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {progress}%
                      </span>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                >
                  <UploadIcon size={20} color={isDragging ? ACCENT : TEXT_MUTED} />
                  <span style={{ fontSize: 11, color: isDragging ? ACCENT : TEXT_MUTED, fontWeight: 500 }}>
                    {isDragging ? "Bırak" : "Görsel yükle"}
                  </span>
                  <span style={{ fontSize: 10, color: TEXT_FAINT }}>
                    tıkla veya sürükle-bırak
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </div>

      {/* Upload error */}
      <AnimatePresence>
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0.18, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              padding: "8px 10px",
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.28)",
              borderRadius: 7,
              fontSize: 11,
              color: "rgb(254,202,202)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <span aria-hidden="true">⚠</span>
              <span style={{ flex: 1 }}>{uploadError}</span>
              <button
                type="button"
                onClick={() => setUploadState(null)}
                style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: "0 2px", opacity: 0.6, fontSize: 13, lineHeight: 1 }}
                aria-label="Hatayı kapat"
              >✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* URL input (fallback / override) */}
      <label style={labelStyle}>
        <span style={labelTextStyle}>Görsel URL</span>
        <input
          type="url"
          value={src}
          onChange={(e) => patch({ src: e.target.value })}
          placeholder="https://..."
          className="inscribed-field"
          style={fieldStyle}
        />
      </label>

      {/* Alt text */}
      <label style={labelStyle}>
        <span style={labelTextStyle}>Alt Metin</span>
        <input
          type="text"
          value={alt}
          onChange={(e) => patch({ alt: e.target.value })}
          className="inscribed-field"
          style={fieldStyle}
        />
      </label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * @param {{ size?: number, color?: string }} props
 */
function UploadIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}