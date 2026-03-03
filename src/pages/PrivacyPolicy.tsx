import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Button variant="ghost" className="mb-6 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mb-8">Last updated: March 2026</p>

        <div className="space-y-8 text-sm leading-7 text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Account data:</strong> username, hashed password, and profile preferences
                (risk tolerance, investment interests).
              </li>
              <li>
                <strong>Usage data:</strong> pages visited, features used, session duration.
              </li>
              <li>
                <strong>Technical data:</strong> IP address, browser type, device information.
              </li>
              <li>
                <strong>Telegram ID:</strong> if provided, used only to deliver personalised alerts.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide, personalise, and improve the Service.</li>
              <li>To send financial alerts and reports based on your preferences.</li>
              <li>To monitor for fraud, abuse, and security threats.</li>
              <li>To comply with legal obligations.</li>
              <li>To analyse usage patterns and improve our AI models.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. Data Storage & Security</h2>
            <p>
              Your data is stored securely using industry-standard encryption. Passwords are
              SHA-256 hashed before storage. We use Pinecone vector databases with access controls.
              No plain-text passwords are ever stored.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>OpenAI:</strong> For AI-powered financial analysis (data sent: article text).</li>
              <li><strong>Pinecone:</strong> For vector database storage.</li>
              <li><strong>Sentry:</strong> For error monitoring (anonymised error data).</li>
              <li><strong>Google Analytics:</strong> For usage analytics (anonymised).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. You may request
              deletion at any time. Anonymised analytics data may be retained indefinitely.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Your Rights (GDPR)</h2>
            <p>If you are in the European Economic Area, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your data ("right to be forgotten").</li>
              <li>Object to or restrict processing of your data.</li>
              <li>Request a portable copy of your data.</li>
              <li>Lodge a complaint with your local data protection authority.</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:privacy@investoraai.com" className="text-primary underline">
                privacy@investoraai.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Cookies</h2>
            <p>
              We use essential cookies for authentication and session management. Analytics cookies
              are only set with your consent. You can control cookie preferences in your browser
              settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Children's Privacy</h2>
            <p>
              The Service is not directed at children under 18. We do not knowingly collect personal
              information from minors.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Contact</h2>
            <p>
              For privacy-related questions, contact us at{" "}
              <a href="mailto:privacy@investoraai.com" className="text-primary underline">
                privacy@investoraai.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
