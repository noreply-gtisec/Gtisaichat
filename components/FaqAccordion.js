'use client';

export default function FaqAccordion({ faqs, activeFaq, toggleFaq }) {
  return (
    <section id="faq" className="section-padding">
      <div className="container">
        <span className="mono-small">04 / KNOWLEDGE BASE</span>
        <h2 className="section-title" style={{ marginTop: '8px' }}>
          Frequently Asked Questions
        </h2>

        <div className="faq-container">
          {faqs.map((faq, index) => (
            <div key={index} className="faq-row">
              <button
                className="faq-trigger"
                onClick={() => toggleFaq(index)}
                aria-expanded={activeFaq === index}
              >
                <span className="faq-question">{faq.question}</span>
                <span className={`faq-chevron ${activeFaq === index ? 'open' : ''}`} aria-hidden="true">
                  ↓
                </span>
              </button>
              <div className={`faq-answer ${activeFaq === index ? 'open' : ''}`}>
                <div className="faq-answer-inner">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
