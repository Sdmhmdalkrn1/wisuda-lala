import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import imageCompression from "browser-image-compression";
import "./App.css";

function App() {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedImg, setSelectedImg] = useState(null); // Untuk fitur Lightbox

  // Mengambil data secara realtime dari Firestore
  useEffect(() => {
    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedImages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setImages(fetchedImages);
    });
    return () => unsubscribe();
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      // Kompresi agar hemat kuota internet HP
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1080, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);
      
      const formData = new FormData();
      formData.append("image", compressedFile);
      const imgbbApiKey = "d2975f87630c09664c72c8f0347931c4"; 
      
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Gagal upload ke ImgBB");

      // Simpan link ke Firestore
      await addDoc(collection(db, "gallery"), {
        imageUrl: data.data.url,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      alert("Gagal mengunggah foto. Coba lagi ya!");
    }
    setUploading(false);
  };

  return (
    <div className="app-container">
      {/* Bagian Atas: Efek Kaca (Glassmorphism) */}
      <div className="glass-header">
        <h1>🎓 Wisuda Lala ✨</h1>
        <p>Koleksi memori manis kita</p>
        
        {/* Tombol Upload Estetik */}
        <label className="upload-btn">
          {uploading ? "Menyimpan memori... ⏳" : "📸 Tambah Foto"}
          <input type="file" accept="image/*" onChange={handleUpload} hidden disabled={uploading} />
        </label>
      </div>

      {/* Galeri Masonry */}
      <div className="masonry-grid">
        {images.map((img) => (
          <div key={img.id} className="masonry-item" onClick={() => setSelectedImg(img.imageUrl)}>
            {/* loading="lazy" sangat penting agar HP tidak lag */}
            <img src={img.imageUrl} alt="Kenangan" loading="lazy" />
          </div>
        ))}
      </div>

      {/* Lightbox: Muncul membesar saat foto diketuk di HP */}
      {selectedImg && (
        <div className="lightbox" onClick={() => setSelectedImg(null)}>
          <span className="close-btn">&times;</span>
          <img src={selectedImg} alt="Zoomed" className="lightbox-img" />
        </div>
      )}
    </div>
  );
}

export default App;