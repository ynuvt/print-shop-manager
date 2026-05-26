import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, RefreshCw, Save, ToggleLeft, ToggleRight } from "lucide-react";
import toast from "react-hot-toast";
import { getOffers, updateFirstTimeOffer, updateReturningOffer } from "../api/brandApi";
import FileUploader from "../components/FileUploader";

interface Offer {
  id: string;
  offerType: string;
  campaignType: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  isActive: boolean;
  imageUrl: string | null;
}

function OfferCard({ title, icon: Icon, cardClass, offer, onSave }: {
  title: string;
  icon: typeof Sparkles;
  cardClass: string;
  offer: Offer | null;
  onSave: (data: any) => Promise<void>;
}) {
  const [campaignType, setCampaignType] = useState(offer?.campaignType || "COUPON");
  const [name, setName] = useState(offer?.name || "");
  const [description, setDescription] = useState(offer?.description || "");
  const [discountType, setDiscountType] = useState(offer?.discountType || "PERCENTAGE");
  const [discountValue, setDiscountValue] = useState(offer?.discountValue?.toString() || "");
  const [imageUrl, setImageUrl] = useState(offer?.imageUrl || "");
  const [isActive, setIsActive] = useState(offer?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (offer) {
      setCampaignType(offer.campaignType || "COUPON");
      setName(offer.name);
      setDescription(offer.description || "");
      setDiscountType(offer.discountType);
      setDiscountValue(offer.discountValue.toString());
      setImageUrl(offer.imageUrl || "");
      setIsActive(offer.isActive);
    }
  }, [offer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name,
        description,
        discountType: campaignType === "ADVERTISEMENT" ? "PERCENTAGE" : discountType,
        discountValue: campaignType === "ADVERTISEMENT" ? 0 : parseFloat(discountValue),
        imageUrl: imageUrl || undefined,
        isActive,
        campaignType,
      });
      toast.success("Offer saved!");
    } catch { toast.error("Failed to save offer"); }
    finally { setSaving(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }} className={`brand-offer-card ${cardClass}`}>
      <div className="brand-offer-header">
        <div className="brand-offer-icon"><Icon size={20} color="#fbbf24" /></div>
        <div>
          <p className="brand-offer-title">{title}</p>
          <p className="brand-offer-desc">Configure campaign for this offer type</p>
        </div>
        <button type="button" onClick={() => setIsActive(!isActive)} className="brand-toggle-btn">
          {isActive ? <ToggleRight size={32} color="#34d399" /> : <ToggleLeft size={32} color="#52525b" />}
        </button>
      </div>
      <form onSubmit={handleSubmit} className="brand-gap-4">
        <div className="brand-form-group">
          <label className="brand-label">Campaign Type</label>
          <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)} className="brand-select">
            <option value="COUPON">Coupon Campaign</option>
            <option value="ADVERTISEMENT">Advertisement Campaign</option>
          </select>
        </div>
        <div className="brand-form-group">
          <label className="brand-label">Campaign Title / Offer Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder={campaignType === "COUPON" ? "e.g., Welcome Discount" : "e.g., Summer Special Drinks"} className="brand-input" />
        </div>
        <div className="brand-form-group">
          <label className="brand-label">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={campaignType === "COUPON" ? "e.g., Get 15% off your first coffee!" : "e.g., Try our new cold brews at any outlet!"} className="brand-textarea" />
        </div>
        <div className="brand-form-group">
          <FileUploader value={imageUrl} onChange={setImageUrl} label="Poster Image (optional)" />
        </div>
        {campaignType === "COUPON" && (
          <div className="brand-form-row">
            <div className="brand-form-group">
              <label className="brand-label">Type</label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="brand-select">
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FLAT">Flat (₹)</option>
              </select>
            </div>
            <div className="brand-form-group">
              <label className="brand-label">Value</label>
              <input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} required min={0} placeholder={discountType === "PERCENTAGE" ? "15" : "50"} className="brand-input" />
            </div>
          </div>
        )}

        {name && (
          <div style={{ marginTop: 24, borderTop: "1px solid rgba(63, 63, 70, 0.25)", paddingTop: 20 }}>
            <p className="brand-offer-title" style={{ fontSize: 13, marginBottom: 12 }}>Customer Feed Preview</p>
            
            <div
              style={{
                width: "100%",
                maxWidth: "280px",
                margin: "0 auto",
                background: "#111",
                border: "1px solid #27272a",
                borderRadius: "16px",
                overflow: "hidden",
                boxShadow: "0 10px 24px rgba(0,0,0,0.5)",
                display: "flex",
                flexDirection: "column",
                textAlign: "left",
              }}
            >
              {/* Header bar mimic */}
              <div style={{ height: "16px", background: "#09090b", display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 8px", gap: "4px" }}>
                <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#444" }} />
                <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#444" }} />
                <div style={{ width: "12px", height: "4px", borderRadius: "2px", background: "#444" }} />
              </div>

              {/* Content banner */}
              <div style={{ position: "relative", width: "100%", height: "130px", background: "#1f1f23", overflow: "hidden" }}>
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Offer poster preview"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#52525b", gap: 4 }}>
                    <Sparkles size={24} />
                    <span style={{ fontSize: 10 }}>No Poster Image</span>
                  </div>
                )}

                {/* Brand Logo mimic */}
                <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", padding: "3px 8px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <span style={{ fontSize: "9px", fontWeight: 900, color: "var(--brand, #FACC15)", letterSpacing: "0.05em" }}>Your Brand</span>
                </div>
              </div>

              {/* Offer Details */}
              <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {campaignType === "COUPON" ? (
                    <span style={{
                      background: "rgba(255,255,255,0.06)",
                      color: "#fff",
                      fontSize: "8px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}>
                      {discountType === "PERCENTAGE" ? `${discountValue}% OFF` : `₹${discountValue} OFF`}
                    </span>
                  ) : (
                    <span style={{
                      background: "rgba(255,255,255,0.06)",
                      color: "#a1a1aa",
                      fontSize: "8px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}>
                      FEATURED CAMPAIGN
                    </span>
                  )}
                </div>
                <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#fff", margin: 0 }}>
                  {name || "Welcome Campaign"}
                </h4>
                {description && (
                  <p style={{ fontSize: "11px", color: "#a1a1aa", margin: 0, lineHeight: "1.3" }}>
                    {description}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <button type="submit" disabled={saving} className="brand-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
          {saving ? <div className="brand-spinner-sm" /> : <><Save size={16} /> Save Campaign</>}
        </button>
      </form>
    </motion.div>
  );
}

export default function BrandOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"first-time" | "returning">("first-time");

  useEffect(() => {
    getOffers().then((d) => setOffers(d.offers)).finally(() => setLoading(false));
  }, []);

  const firstTime = offers.find((o) => o.offerType === "FIRST_TIME") || null;
  const returning = offers.find((o) => o.offerType === "RETURNING") || null;

  if (loading) {
    return (
      <div className="brand-gap-4" style={{ animation: "pulse 2s ease-in-out infinite" }}>
        <div className="brand-skeleton" style={{ height: 32, width: 128 }} />
        <div className="brand-offers-grid">
          <div className="brand-skeleton" style={{ height: 384 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="brand-gap-6">
      <div>
        <h1 className="brand-page-title">Campaigns</h1>
        <p className="brand-page-subtitle">Configure first-time and returning customer coupon and advertisement campaigns</p>
      </div>

      <div className="brand-tabs" role="tablist">
        <button
          className={`brand-tab ${activeTab === "first-time" ? "active" : ""}`}
          onClick={() => setActiveTab("first-time")}
          role="tab"
          aria-selected={activeTab === "first-time"}
        >
          First-time Campaign
        </button>
        <button
          className={`brand-tab ${activeTab === "returning" ? "active" : ""}`}
          onClick={() => setActiveTab("returning")}
          role="tab"
          aria-selected={activeTab === "returning"}
        >
          Returning Campaign
        </button>
      </div>

      <div className="brand-offers-grid" style={{ gridTemplateColumns: "1fr" }}>
        {activeTab === "first-time" ? (
          <OfferCard title="First-time Campaign" icon={Sparkles} cardClass="first-time" offer={firstTime} onSave={updateFirstTimeOffer} />
        ) : (
          <OfferCard title="Returning Campaign" icon={RefreshCw} cardClass="returning" offer={returning} onSave={updateReturningOffer} />
        )}
      </div>
    </div>
  );
}
