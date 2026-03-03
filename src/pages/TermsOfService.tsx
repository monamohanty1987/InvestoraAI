import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Button variant="ghost" className="mb-6 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground text-sm mb-8">Last updated: March 2026</p>

        <div className="space-y-8 text-sm leading-7 text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using InvestoraAI ("the Service"), you agree to be bound by these Terms
              of Service. If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. Description of Service</h2>
            <p>
              InvestoraAI is an AI-powered financial news analysis platform that provides sentiment
              analysis, market insights, and information for educational and informational purposes only.
              The Service does not provide personalised financial, investment, legal, or tax advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. User Accounts</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>You must be at least 18 years old to use the Service.</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You agree to provide accurate, current, and complete information during registration.</li>
              <li>We reserve the right to terminate accounts that violate these terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Service for any unlawful purpose or in violation of any regulations.</li>
              <li>Attempt to gain unauthorized access to any part of the Service.</li>
              <li>Transmit any harmful, offensive, or disruptive content.</li>
              <li>Use automated scripts to access the Service without written permission.</li>
              <li>Resell or redistribute the Service without authorisation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Intellectual Property</h2>
            <p>
              All content, trademarks, and data on the Service are the property of InvestoraAI or its
              licensors. You may not copy, distribute, or create derivative works without our express
              written consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" without warranties of any kind, express or implied.
              We do not warrant that the Service will be uninterrupted, error-free, or that results
              obtained from use of the Service will be accurate or reliable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, InvestoraAI shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages, including but not
              limited to loss of profits or investment losses, arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Continued use of the Service
              after changes constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Contact</h2>
            <p>
              For questions about these Terms, please contact us at{" "}
              <a href="mailto:legal@investoraai.com" className="text-primary underline">
                legal@investoraai.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
