import React, { useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import imageCompression from "browser-image-compression";
import "./App.css";

// Boleh dipindah ke .env (VITE_IMGBB_KEY) kalau mau lebih rapi.
const IMGBB_API_KEY =
  import.meta.env.VITE_IMGBB_KEY || "d2975f87630c09664c72c8f0347931c4";

const SKELETON_RATIOS = [1.3, 0.8, 1, 1.45, 0.9, 1.2, 0.75, 1.1];

function GalleryItem({ img, index, onOpen, onDelete }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <figure
      className={`tile ${loaded ? "is-loaded" : ""}`}
      onClick={() => onOpen(index)}
    >
      <img
        src={img.imageUrl}
        alt={`Foto wisuda ${index + 1}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />
      <button
        type="button"
        className="tile-delete"
        aria-label="Hapus foto"
        onClick={(e) => onDelete(img.id, e)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </figure>
  );
}

function App() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [viewIndex, setViewIndex] = useState(null);
  const touchStartX = useRef(null);

  useEffect(() => {
    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setImages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsubscribe();
  }, []);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    setProgress({ done: 0, total: files.length });
    let failed = 0;

    for (const file of files) {
      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1080,
          useWebWorker: true,
        });
        const formData = new FormData();
        formData.append("image", compressed);

        const res = await fetch(
          `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
          { method: "POST", body: formData }
        );
        const data = await res.json();
        if (!res.ok) throw new Error("Gagal upload ke ImgBB");

        await addDoc(collection(db, "gallery"), {
          imageUrl: data.data.url,
          createdAt: serverTimestamp(),
        });
      } catch {
        failed += 1;
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setUploading(false);
    if (failed > 0) {
      alert(`${failed} foto gagal diunggah. Coba unggah lagi ya.`);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Hapus foto ini dari galeri?")) return;
    try {
      await deleteDoc(doc(db, "gallery", id));
    } catch {
      alert("Foto gagal dihapus. Coba lagi.");
    }
  };

  const close = useCallback(() => setViewIndex(null), []);
  const next = useCallback(
    () => setViewIndex((i) => (i === null ? i : (i + 1) % images.length)),
    [images.length]
  );
  const prev = useCallback(
    () =>
      setViewIndex((i) =>
        i === null ? i : (i - 1 + images.length) % images.length
      ),
    [images.length]
  );

  // Keyboard + kunci scroll saat lightbox terbuka
  useEffect(() => {
    if (viewIndex === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [viewIndex, close, next, prev]);

  // Kalau foto yang sedang dibuka terhapus / daftar berubah
  useEffect(() => {
    if (viewIndex !== null && viewIndex >= images.length) setViewIndex(null);
  }, [images.length, viewIndex]);

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
  };

  const cover = images[0];
  const percent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-text">
          <h1 className="hero-title">
            Wisuda
            <br />
            Lala
          </h1>
          <p className="hero-sub">
            Kumpulan foto hari wisuda, disimpan di satu tempat.
          </p>

          <div className="hero-meta">
            <div className="count">
              <span className="count-num">{loading ? "–" : images.length}</span>
              <span className="count-label">foto</span>
            </div>

            <label
              className={`btn-upload ${uploading ? "is-busy" : ""}`}
              aria-disabled={uploading}
            >
              {uploading
                ? `Mengunggah ${progress.done}/${progress.total}`
                : "Tambah foto"}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleUpload}
                hidden
                disabled={uploading}
              />
            </label>
          </div>

          {uploading && (
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="progress-bar" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>

        <div className="hero-cover" aria-hidden={!cover}>
          {cover ? (
            <button
              type="button"
              className="arch"
              onClick={() => setViewIndex(0)}
              aria-label="Buka foto terbaru"
            >
              <img src={cover.imageUrl} alt="Foto terbaru" />
            </button>
          ) : (
            <div className={`arch arch-empty ${loading ? "shimmer" : ""}`} />
          )}
        </div>
      </header>

      <main>
        {loading ? (
          <div className="grid" aria-busy="true">
            {SKELETON_RATIOS.map((r, i) => (
              <div
                key={i}
                className="tile skeleton shimmer"
                style={{ aspectRatio: `1 / ${r}` }}
              />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="empty">
            <h2>Belum ada foto</h2>
            <p>Tekan “Tambah foto” untuk mengunggah foto pertama.</p>
          </div>
        ) : (
          <div className="grid">
            {images.map((img, i) => (
              <GalleryItem
                key={img.id}
                img={img}
                index={i}
                onOpen={setViewIndex}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {viewIndex !== null && images[viewIndex] && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Penampil foto"
          onClick={close}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button"
            className="lb-btn lb-close"
            aria-label="Tutup"
            onClick={close}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                className="lb-btn lb-prev"
                aria-label="Foto sebelumnya"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path
                    d="M15 5l-7 7 7 7"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="lb-btn lb-next"
                aria-label="Foto berikutnya"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path
                    d="M9 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </button>
            </>
          )}

          <img
            key={images[viewIndex].id}
            src={images[viewIndex].imageUrl}
            alt={`Foto ${viewIndex + 1} dari ${images.length}`}
            className="lb-img"
            onClick={(e) => e.stopPropagation()}
          />

          <div className="lb-counter">
            {viewIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
