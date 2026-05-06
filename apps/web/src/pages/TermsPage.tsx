import { Link } from "react-router-dom";
import type { ThemeMode } from "../App";
import Navbar from "../components/Navbar";

export default function TermsPage({
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
            <h1>Terms of Service</h1>
            <p>Effective Date: 04/04/2026</p>
          </div>

          <p>
            These Terms of Service ("Terms") govern your access to and use of
            Zopy Prints, a remote print workflow automation platform operated by
            Zopy ("we", "us", or "our"). By registering or using the platform,
            you agree to be bound by these Terms.
          </p>

          <h2 className="legal-title">1. Eligibility</h2>
          <p>
            You must be at least 18 years of age and legally capable of entering
            into a binding contract under the Indian Contract Act, 1872. By
            using this platform, you represent that you meet these requirements.
          </p>

          <h2 className="legal-title">2. Account Registration</h2>
          <p>
            To access the platform, you must create an account. You agree to:
          </p>
          <ul className="legal-list">
            <li>
              Provide accurate and complete information during registration.
            </li>
            <li>Keep your login credentials confidential.</li>
            <li>
              Notify us immediately of any unauthorized access to your account.
            </li>
            <li>
              Accept responsibility for all activity that occurs under your
              account.
            </li>
          </ul>

          <h2 className="legal-title">3. Use of the Platform</h2>
          <h3 className="legal-subtitle">3.1 Permitted Use</h3>
          <p>
            The platform may be used solely for lawful business purposes -
            specifically, the submission, management, and execution of print
            jobs through authorised print vendors.
          </p>
          <h3 className="legal-subtitle">3.2 Prohibited Use</h3>
          <p>You agree not to:</p>
          <ul className="legal-list">
            <li>
              Upload documents that contain illegal, defamatory, obscene, or
              copyrighted content without authorisation.
            </li>
            <li>Attempt to reverse engineer, hack, or disrupt the platform.</li>
            <li>Impersonate any person or entity.</li>
            <li>
              Use the platform to transmit spam, malware, or harmful code.
            </li>
            <li>Circumvent any access controls or billing mechanisms.</li>
          </ul>

          <h2 className="legal-title">4. Vendor Responsibilities</h2>
          <p>Print vendors using the platform agree to:</p>
          <ul className="legal-list">
            <li>Review and approve only legitimate print jobs.</li>
            <li>Maintain the confidentiality of all uploaded documents.</li>
            <li>Ensure that printed materials comply with applicable laws.</li>
            <li>
              Not retain or reproduce any user-submitted documents beyond the
              scope of the print job.
            </li>
          </ul>

          <h2 className="legal-title">5. Intellectual Property</h2>
          <p>
            All documents uploaded by users remain the intellectual property of
            the respective uploader. By uploading content, you grant us a
            limited, non-exclusive licence solely to process and display the
            document for the purpose of print job execution. We do not claim
            ownership over your content.
          </p>
          <p>
            The platform&apos;s software, interface, branding, and technology
            remain the exclusive property of Zopy and are protected under
            applicable intellectual property laws.
          </p>

          <h2 className="legal-title">6. Payment and Billing</h2>
          <p>
            Access to certain features of the platform may require a paid
            subscription. By subscribing, you agree to pay the applicable fees
            as listed on our Pricing page. All fees are in Indian Rupees (INR)
            unless stated otherwise. We reserve the right to update pricing with
            prior notice.
          </p>

          <h2 className="legal-title">7. Account Termination</h2>
          <p>
            We reserve the right to suspend or terminate your account without
            notice if you:
          </p>
          <ul className="legal-list">
            <li>Violate these Terms.</li>
            <li>Engage in fraudulent or abusive behaviour.</li>
            <li>Fail to pay subscription fees.</li>
          </ul>
          <p>
            You may terminate your account at any time by contacting us at
            zopy.queries@gmail.com. Upon termination, your data will be handled
            as described in our Privacy Policy.
          </p>

          <h2 className="legal-title">8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, Zopy shall not be
            liable for any indirect, incidental, special, or consequential
            damages arising out of your use of the platform, including but not
            limited to loss of data, revenue, or business opportunities.
          </p>
          <p>
            Our total liability to you for any claim shall not exceed the amount
            paid by you to us in the three (3) months preceding the claim.
          </p>

          <h2 className="legal-title">9. Disclaimer of Warranties</h2>
          <p>
            The platform is provided on an "as is" and "as available" basis
            without warranties of any kind, either express or implied, including
            but not limited to merchantability, fitness for a particular
            purpose, or non-infringement.
          </p>

          <h2 className="legal-title">
            10. Governing Law and Dispute Resolution
          </h2>
          <p>
            These Terms shall be governed by and construed in accordance with
            the laws of India. Any disputes arising out of these Terms shall be
            subject to the exclusive jurisdiction of the courts in Mumbai,
            Maharashtra, India.
          </p>

          <h2 className="legal-title">11. Amendments</h2>
          <p>
            We reserve the right to modify these Terms at any time. Updated
            Terms will be posted on our website with a revised effective date.
            Continued use of the platform after any changes constitutes your
            acceptance of the new Terms.
          </p>

          <h2 className="legal-title">12. Contact</h2>
          <p>
            For questions regarding these Terms, contact us at:
            zopy.queries@gmail.com
          </p>
        </section>

        <section className="hero-panel legal-card">
          <div className="hero-header">
            <h1>Privacy Policy</h1>
            <p>Effective Date: 04/04/2026</p>
          </div>

          <p>
            This Privacy Policy explains how Zopy ("we", "us", "our") collects,
            uses, stores, and protects information when you use Zopy Prints. We
            are committed to protecting your personal data in compliance with
            the Information Technology Act, 2000 and the Information Technology
            (Reasonable Security Practices and Procedures and Sensitive Personal
            Data or Information) Rules, 2011.
          </p>

          <h2 className="legal-title">1. Information We Collect</h2>
          <h3 className="legal-subtitle">1.1 Information You Provide</h3>
          <ul className="legal-list">
            <li>
              Account details: name, email address, phone number, business name.
            </li>
            <li>
              Payment information: processed securely through third-party
              payment gateways; we do not store card details.
            </li>
            <li>
              Uploaded documents: files submitted for print job processing.
            </li>
          </ul>
          <h3 className="legal-subtitle">
            1.2 Information Collected Automatically
          </h3>
          <ul className="legal-list">
            <li>
              IP address and device type (for security and fraud prevention).
            </li>
            <li>Usage logs: pages visited, actions taken, timestamps.</li>
          </ul>

          <h2 className="legal-title">2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="legal-list">
            <li>Create and manage your account.</li>
            <li>Process and execute print jobs.</li>
            <li>
              Send transactional communications (job confirmations, invoices).
            </li>
            <li>Improve the platform&apos;s performance and features.</li>
            <li>Comply with legal obligations.</li>
          </ul>
          <p>
            We do not use your data for advertising purposes and do not sell
            your data to third parties.
          </p>

          <h2 className="legal-title">3. Document Handling and Retention</h2>
          <p>
            Uploaded documents are stored securely on our servers solely for the
            purpose of fulfilling the print job. Documents are automatically
            deleted from our servers within [X hours/days] after a print job is
            completed or cancelled. Vendors do not retain copies of uploaded
            documents beyond the execution of the job.
          </p>

          <h2 className="legal-title">4. Data Sharing</h2>
          <p>
            We share your information only in the following limited
            circumstances:
          </p>
          <ul className="legal-list">
            <li>
              With the print vendor assigned to your job, solely to fulfil the
              print request.
            </li>
            <li>
              With third-party service providers (e.g., payment processors,
              cloud hosting) under strict confidentiality agreements.
            </li>
            <li>
              With law enforcement or government authorities when required by
              applicable law.
            </li>
          </ul>
          <p>
            We do not share your data with advertisers or unrelated third
            parties.
          </p>

          <h2 className="legal-title">5. Data Security</h2>
          <p>
            We implement industry-standard security measures including
            encryption in transit (TLS), access controls, and secure server
            environments. However, no method of transmission over the internet
            is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h2 className="legal-title">6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="legal-list">
            <li>Access the personal data we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request deletion of your account and associated data.</li>
            <li>Withdraw consent for data processing (where applicable).</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at
            zopy.queries@gmail.com
          </p>

          <h2 className="legal-title">7. Children&apos;s Privacy</h2>
          <p>
            The platform is not intended for use by individuals under the age of
            18. We do not knowingly collect personal information from minors.
          </p>

          <h2 className="legal-title">8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. The updated
            version will be posted on our website with a revised effective date.
            Continued use of the platform constitutes acceptance of the updated
            policy.
          </p>

          <h2 className="legal-title">9. Contact</h2>
          <p>
            For privacy-related queries, reach us at: zopy.queries@gmail.com
          </p>
        </section>

        <section className="hero-panel legal-card">
          <div className="hero-header">
            <h1>Refund Policy</h1>
            <p>Effective Date: 04/04/2026</p>
          </div>

          <p>
            This Refund Policy outlines the conditions under which Zopy offers
            refunds for subscriptions and services on Zopy Prints. Please read
            this policy carefully before making a purchase.
          </p>

          <h2 className="legal-title">1. Subscription Refunds</h2>
          <p>
            We offer a 7-day money-back guarantee on all new subscription plans.
            If you are not satisfied with the platform within the first 7 days
            of your initial subscription, you may request a full refund with no
            questions asked.
          </p>
          <p>
            After the 7-day window, subscription fees are non-refundable. You
            will continue to have access to the platform until the end of your
            current billing period.
          </p>

          <h2 className="legal-title">2. Eligibility for Refund</h2>
          <p>A refund may be issued if:</p>
          <ul className="legal-list">
            <li>
              The request is made within 7 days of the initial subscription
              date.
            </li>
            <li>
              The platform experienced significant downtime or technical failure
              that prevented use for an extended period (more than 48 continuous
              hours), and the issue was reported to our support team.
            </li>
            <li>A billing error occurred (e.g., duplicate charge).</li>
          </ul>

          <h2 className="legal-title">3. Non-Refundable Cases</h2>
          <p>Refunds will not be issued in the following circumstances:</p>
          <ul className="legal-list">
            <li>Requests made after the 7-day refund window.</li>
            <li>
              Renewal charges on active subscriptions (you are responsible for
              cancelling before renewal).
            </li>
            <li>
              Partial months - we do not prorate refunds for unused time in a
              billing cycle.
            </li>
            <li>
              Accounts terminated due to a violation of our Terms of Service.
            </li>
            <li>
              Dissatisfaction with print output quality caused by the vendor
              (this is a vendor-level dispute).
            </li>
          </ul>

          <h2 className="legal-title">4. How to Request a Refund</h2>
          <p>
            To request a refund, email us at zopy.queries@gmail.com with the
            subject line "Refund Request" and include:
          </p>
          <ul className="legal-list">
            <li>Your registered email address.</li>
            <li>The date of subscription.</li>
            <li>The reason for the refund request.</li>
          </ul>
          <p>
            We will review and respond to your request within 5 business days.
            Approved refunds will be credited to your original payment method
            within 7-10 business days, depending on your bank or payment
            provider.
          </p>

          <h2 className="legal-title">5. Subscription Cancellation</h2>
          <p>
            You may cancel your subscription at any time from your account
            settings. Cancellation stops future billing but does not entitle you
            to a refund for the current billing period, unless you are within
            the 7-day refund window.
          </p>

          <h2 className="legal-title">6. Changes to This Policy</h2>
          <p>
            We reserve the right to modify this Refund Policy at any time. Any
            changes will be posted on our website and will apply to
            subscriptions initiated after the updated effective date.
          </p>

          <h2 className="legal-title">7. Contact</h2>
          <p>
            For refund-related queries, contact us at: zopy.queries@gmail.com
          </p>
        </section>

        <section className="hero-panel legal-card">
          <div className="hero-header">
            <h1>Acceptable Use Policy</h1>
            <p>Effective Date: 04/04/2026</p>
          </div>

          <p>
            This Acceptable Use Policy ("AUP") sets out the rules governing the
            use of Zopy Prints by users and vendors. By using the platform, you
            agree to comply with this policy. This AUP is incorporated into and
            forms part of our Terms of Service.
          </p>

          <h2 className="legal-title">1. Permitted Use</h2>
          <p>
            The platform is intended solely for the submission, management, and
            execution of legitimate print jobs between users and authorised
            print vendors. You may use the platform for:
          </p>
          <ul className="legal-list">
            <li>
              Uploading documents for personal, academic, or business printing
              purposes.
            </li>
            <li>Managing print job queues as a vendor.</li>
            <li>Billing and record-keeping related to print services.</li>
          </ul>

          <h2 className="legal-title">2. Permitted File Types</h2>
          <p>The following file formats are accepted on the platform:</p>
          <ul className="legal-list">
            <li>PDF (.pdf) - preferred format for print jobs.</li>
            <li>Microsoft Word (.doc, .docx).</li>
            <li>Image files (.jpg, .jpeg, .png, .tiff) where supported.</li>
          </ul>
          <p>
            Files must not exceed the maximum upload size specified on the
            platform. We reserve the right to reject files that do not meet
            technical requirements.
          </p>

          <h2 className="legal-title">3. Prohibited Content</h2>
          <p>You must not upload, submit, or distribute any content that:</p>
          <ul className="legal-list">
            <li>
              Is illegal under Indian law or the laws of any applicable
              jurisdiction.
            </li>
            <li>
              Infringes any third-party copyright, trademark, or intellectual
              property rights without proper authorisation.
            </li>
            <li>
              Is defamatory, obscene, pornographic, hateful, or discriminatory.
            </li>
            <li>Promotes violence, terrorism, or illegal activities.</li>
            <li>
              Contains personal data of third parties without their consent.
            </li>
            <li>Is fraudulent, misleading, or deceptive in nature.</li>
            <li>Contains malware, viruses, or any malicious code.</li>
          </ul>

          <h2 className="legal-title">4. Prohibited Actions</h2>
          <p>You must not:</p>
          <ul className="legal-list">
            <li>
              Attempt to gain unauthorised access to other user accounts or
              backend systems.
            </li>
            <li>
              Use automated bots, scripts, or tools to scrape or overload the
              platform.
            </li>
            <li>
              Interfere with the normal functioning of the platform or its
              infrastructure.
            </li>
            <li>
              Resell or sublicence access to the platform without written
              consent from us.
            </li>
            <li>
              Impersonate another user, vendor, or company representative.
            </li>
            <li>
              Misuse the job ID verification system to access or trigger
              unauthorised print jobs.
            </li>
          </ul>

          <h2 className="legal-title">5. Vendor-Specific Obligations</h2>
          <p>Print vendors using the platform must additionally:</p>
          <ul className="legal-list">
            <li>
              Not print, reproduce, or retain copies of user-submitted documents
              beyond what is required to fulfil the job.
            </li>
            <li>
              Report any suspicious or prohibited content encountered during job
              review to us immediately.
            </li>
            <li>
              Ensure their printing environment is secure and that access to the
              vendor dashboard is restricted to authorised personnel only.
            </li>
          </ul>

          <h2 className="legal-title">6. Enforcement</h2>
          <p>
            We reserve the right to investigate suspected violations of this
            AUP. If a violation is confirmed, we may take the following actions
            at our sole discretion:
          </p>
          <ul className="legal-list">
            <li>Issue a warning to the user or vendor.</li>
            <li>Temporarily suspend access to the platform.</li>
            <li>Permanently terminate the account without refund.</li>
            <li>
              Report the violation to relevant law enforcement authorities where
              required.
            </li>
          </ul>

          <h2 className="legal-title">7. Reporting Violations</h2>
          <p>
            If you become aware of any content or behaviour that violates this
            AUP, please report it to us at zopy.queries@gmail.com. We will
            investigate all reports promptly and in confidence.
          </p>

          <h2 className="legal-title">8. Changes to This Policy</h2>
          <p>
            We may update this AUP at any time. Changes will be posted on our
            website with a revised effective date. Continued use of the platform
            constitutes acceptance of the revised policy.
          </p>

          <h2 className="legal-title">9. Contact</h2>
          <p>
            For questions about this policy, contact us at:
            zopy.queries@gmail.com
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
