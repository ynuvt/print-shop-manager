import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

// Landing page for QR codes: /sid/TCET
// Stores the shop ID in sessionStorage then redirects to home so
// HomePage can auto-select it without polluting the recent-shops list.
export default function SidRedirectPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const clean = shopId?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
    if (clean) sessionStorage.setItem("printowl_session_sid", clean);
    navigate("/", { replace: true });
  }, [shopId, navigate]);

  return null;
}
