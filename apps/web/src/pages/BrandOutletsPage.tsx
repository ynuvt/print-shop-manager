import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Plus, Users, ExternalLink, X, Edit2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { getOutlets, createOutlet, updateOutlet, deleteOutlet } from "../api/brandApi";

interface OutletData {
  id: string; name: string; address: string | null; outletCode: string;
  latitude: number | null; longitude: number | null; mapLink: string | null;
  isActive: boolean; createdAt: string;
  _count: { workers: number; redemptions: number };
}

export default function BrandOutletsPage() {
  const navigate = useNavigate();
  const [outlets, setOutlets] = useState<OutletData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", address: "", outletCode: "", latitude: "", longitude: "", mapLink: "" });

  const load = () => getOutlets().then((d) => setOutlets(d.outlets)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditId(null); setForm({ name: "", address: "", outletCode: "", latitude: "", longitude: "", mapLink: "" }); setModalOpen(true); };
  const openEdit = (o: OutletData) => {
    setEditId(o.id);
    setForm({ name: o.name, address: o.address || "", outletCode: o.outletCode, latitude: o.latitude?.toString() || "", longitude: o.longitude?.toString() || "", mapLink: o.mapLink || "" });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body: any = { ...form };
      if (form.latitude) body.latitude = parseFloat(form.latitude);
      else delete body.latitude;
      if (form.longitude) body.longitude = parseFloat(form.longitude);
      else delete body.longitude;

      if (editId) { await updateOutlet(editId, body); toast.success("Outlet updated!"); }
      else { await createOutlet(body); toast.success("Outlet created!"); }
      setModalOpen(false); load();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Failed"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate this outlet?")) return;
    try { await deleteOutlet(id); toast.success("Outlet deactivated"); load(); }
    catch { toast.error("Failed"); }
  };

  if (loading) {
    return (
      <div style={{ animation: "pulse 2s ease-in-out infinite" }}>
        <div className="brand-skeleton" style={{ height: 32, width: 128, marginBottom: 24 }} />
        <div className="brand-outlets-grid">{[...Array(3)].map((_, i) => <div key={i} className="brand-skeleton" style={{ height: 192 }} />)}</div>
      </div>
    );
  }

  return (
    <div className="brand-gap-6">
      <div className="brand-flex-between">
        <div><h1 className="brand-page-title">Outlets</h1><p className="brand-page-subtitle">Manage your outlet locations</p></div>
        <button onClick={openCreate} className="brand-btn-primary"><Plus size={16} /> Add Outlet</button>
      </div>

      <div className="brand-outlets-grid">
        {outlets.map((o, i) => (
          <motion.div key={o.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.06 } }}
            className={`brand-outlet-card ${!o.isActive ? "inactive" : ""}`}
            onClick={() => navigate(`/brand/outlets/${o.id}/workers`)}
          >
            <div className="brand-outlet-top">
              <div className="brand-outlet-name-row">
                <div className="brand-outlet-icon"><MapPin size={16} color="#fbbf24" /></div>
                <div><p className="brand-outlet-name">{o.name}</p><p className="brand-outlet-code">{o.outletCode}</p></div>
              </div>
              <div className="brand-actions-row" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => openEdit(o)} className="brand-btn-icon"><Edit2 size={14} /></button>
                <button onClick={() => handleDelete(o.id)} className="brand-btn-icon danger"><Trash2 size={14} /></button>
              </div>
            </div>
            {o.address && <p className="brand-outlet-address">{o.address}</p>}
            <div className="brand-outlet-footer">
              <div className="brand-outlet-workers"><Users size={14} /> {o._count.workers} workers</div>
              {o.mapLink && (
                <a href={o.mapLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="brand-map-link">
                  <ExternalLink size={12} /> Map
                </a>
              )}
            </div>
          </motion.div>
        ))}
        {outlets.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "64px 0", color: "#52525b" }}>No outlets yet. Create your first outlet.</div>}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="brand-modal-overlay" onClick={() => setModalOpen(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="brand-modal" onClick={(e) => e.stopPropagation()}>
              <div className="brand-modal-header">
                <h3 className="brand-modal-title">{editId ? "Edit" : "Add"} Outlet</h3>
                <button onClick={() => setModalOpen(false)} className="brand-modal-close"><X size={16} /></button>
              </div>
              <form onSubmit={handleSave} className="brand-gap-4">
                <div className="brand-form-group"><label className="brand-label">Outlet Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g., Koramangala Branch" className="brand-input" /></div>
                <div className="brand-form-group"><label className="brand-label">Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" className="brand-input" /></div>
                <div className="brand-form-group"><label className="brand-label">Outlet Code</label><input value={form.outletCode} onChange={(e) => setForm({ ...form, outletCode: e.target.value })} required placeholder="e.g., KRM-BLR-01" className="brand-input" /></div>
                <div className="brand-form-row">
                  <div className="brand-form-group"><label className="brand-label">Latitude</label><input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="12.9716" className="brand-input" /></div>
                  <div className="brand-form-group"><label className="brand-label">Longitude</label><input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="77.5946" className="brand-input" /></div>
                </div>
                <div className="brand-form-group"><label className="brand-label">Google Maps Link</label><input value={form.mapLink} onChange={(e) => setForm({ ...form, mapLink: e.target.value })} placeholder="https://maps.google.com/..." className="brand-input" /></div>
                <button type="submit" className="brand-btn-primary" style={{ width: "100%", justifyContent: "center" }}>{editId ? "Update" : "Create"} Outlet</button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
