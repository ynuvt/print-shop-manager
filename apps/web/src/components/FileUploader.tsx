import React, { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { uploadBrandFile } from "../api/brandApi";
import toast from "react-hot-toast";

interface FileUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}

export default function FileUploader({ value, onChange, label = "Upload Image" }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file.");
      return;
    }

    setUploading(true);
    try {
      const publicUrl = await uploadBrandFile(file);
      onChange(publicUrl);
      toast.success("Image uploaded successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="brand-form-group">
      {label && <label className="brand-label">{label}</label>}
      
      <div
        style={{
          position: "relative",
          border: "2px dashed rgba(63, 63, 70, 0.4)",
          borderRadius: "12px",
          background: "rgba(24, 24, 27, 0.3)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          minHeight: "120px",
          transition: "border-color 0.2s ease, background 0.2s ease",
          cursor: uploading ? "not-allowed" : "pointer",
        }}
        onMouseOver={(e) => {
          if (!uploading) {
            e.currentTarget.style.borderColor = "rgba(245, 158, 11, 0.4)";
            e.currentTarget.style.background = "rgba(39, 39, 42, 0.3)";
          }
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = "rgba(63, 63, 70, 0.4)";
          e.currentTarget.style.background = "rgba(24, 24, 27, 0.3)";
        }}
      >
        {uploading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: "#a1a1aa" }}>
            <Loader2 size={24} className="animate-spin" style={{ color: "#facc15" }} />
            <span style={{ fontSize: "12px" }}>Uploading to cloud storage...</span>
          </div>
        ) : value ? (
          <div style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "8px", overflow: "hidden", background: "#1f1f23", flexShrink: 0 }}>
                <img src={value} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: "11px", color: "#a1a1aa", display: "block" }}>Active Image URL:</span>
                <span style={{ fontSize: "12px", color: "#fff", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                  {value}
                </span>
              </div>
            </div>
            <label
              style={{
                flexShrink: 0,
                fontSize: "11px",
                fontWeight: 700,
                color: "#facc15",
                background: "rgba(250, 204, 21, 0.1)",
                padding: "6px 12px",
                borderRadius: "8px",
                cursor: "pointer",
                border: "1px solid rgba(250, 204, 21, 0.2)",
              }}
            >
              Change
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
            </label>
          </div>
        ) : (
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", cursor: "pointer", width: "100%" }}>
            <div style={{ padding: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.03)", color: "#71717a" }}>
              <Upload size={20} />
            </div>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#e4e4e7", display: "block" }}>Click to upload poster image</span>
              <span style={{ fontSize: "11px", color: "#71717a" }}>PNG, JPG, JPEG, WEBP (Max 5MB)</span>
            </div>
            <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
          </label>
        )}
      </div>
    </div>
  );
}
