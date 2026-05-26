import { Link } from "react-router-dom";
import {
  Eye,
  Lightbulb,
  Mail,
  Rocket,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import type { ThemeMode } from "../App";
import Navbar from "../components/Navbar";

export default function AboutPage({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  return (
    <div className="app-shell">
      <Navbar 
        theme={theme} 
        onToggleTheme={onToggleTheme} 
      />

      <main className="main-wrap legal-wrap">
        <section className="hero-panel legal-card">
          <div className="hero-header">
            <h1>About Zopy</h1>
            <p>Remote printing made simple for students and local vendors.</p>
          </div>
          <p className="legal-lead">
            <span className="legal-title-icon" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
            </span>
            At Zopy, we believe printing should be as simple as sending a
            message.
          </p>

          <ul className="legal-list">
            <li>No more waiting in long queues.</li>
            <li>No more rushing to shops uploading prints via WhatsApp.</li>
            <li>No more last-minute stress before submissions.</li>
          </ul>

          <p>
            Zopy is built for students and everyday users who just want their
            documents printed - <strong>fast</strong>, <strong>easy</strong>,
            and from anywhere.
          </p>

          <h2 className="legal-title">
            <span className="legal-title-icon" aria-hidden="true">
              <Rocket size={18} />
            </span>
            What We Do
          </h2>
          <p>Zopy lets you:</p>
          <ul className="legal-list">
            <li>Upload your documents directly from your phone.</li>
            <li>Customize print settings in seconds.</li>
            <li>Get an OTP for secure verification.</li>
            <li>
              Walk into a nearby print shop and collect your prints instantly.
            </li>
          </ul>
          <p>It&apos;s a seamless bridge between your phone and print shops.</p>

          <h2 className="legal-title">
            <span className="legal-title-icon" aria-hidden="true">
              <Target size={18} />
            </span>
            Our Mission
          </h2>
          <p>To eliminate the friction in everyday printing and make it:</p>
          <p>
            <strong>Instant</strong>, <strong>accessible</strong>, and
            <strong> stress-free</strong>.
          </p>
          <p>
            We&apos;re focused on transforming traditional print shops into
            smart, connected service points - without changing how they operate.
          </p>

          <h2 className="legal-title">
            <span className="legal-title-icon" aria-hidden="true">
              <Lightbulb size={18} />
            </span>
            Why Zopy Exists
          </h2>
          <p>We&apos;ve all been there:</p>
          <ul className="legal-list">
            <li>Standing in crowded stationery shops.</li>
            <li>Waiting while others argue over prints.</li>
            <li>Running last minute before deadlines.</li>
          </ul>
          <p>Zopy was created to solve exactly this.</p>
          <p>Instead of chaos - we give you control.</p>

          <h2 className="legal-title">
            <span className="legal-title-icon" aria-hidden="true">
              <Users size={18} />
            </span>
            For Users & Shops
          </h2>
          <h3 className="legal-subtitle">For Users</h3>
          <h3 className="legal-subtitle">For Shopkeepers</h3>
          <p>Get organized orders, reduce confusion, serve customers faster.</p>

          <h2 className="legal-title">
            <span className="legal-title-icon" aria-hidden="true">
              <Eye size={18} />
            </span>
            Our Vision
          </h2>
          <p>
            To become the default way people print documents, connecting
            millions of users with local print shops through a simple, powerful
            platform.
          </p>

          <h2 className="legal-title">
            <span className="legal-title-icon" aria-hidden="true">
              <Zap size={18} />
            </span>
            Built for Speed. Designed for Simplicity.
          </h2>
          <p>
            Zopy is not just a tool - it&apos;s a smarter way to get things
            done.
          </p>

          <p className="legal-contact">
            <span className="legal-title-icon" aria-hidden="true">
              <Mail size={18} />
            </span>
            Contact us at <strong>zopy.queries@gmail.com</strong>.
          </p>
        </section>
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <Link to="/terms" className="footer-link">
            Terms & Conditions
          </Link>
          <Link to="/about" className="footer-link">
            About Us
          </Link>
        </div>
      </footer>
    </div>
  );
}
