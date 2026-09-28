'use client';

export default function ProcessPipeline({ processNodes, activeNode, setActiveNode }) {
  return (
    <section id="process" className="section-padding" style={{ paddingTop: '32px' }}>
      <div className="container">
        <span className="mono-small">02 / METHODOLOGY</span>
        <h2 className="section-title" style={{ marginTop: '8px' }}>
          The Closed-Loop Defense Pipeline
        </h2>

        <div className="process-diagram-wrapper">
          <div className="process-glow" aria-hidden="true"></div>

          <div className="pipeline-nodes-container">
            {processNodes.map((node, index) => (
              <div
                key={node.num}
                className={`pipeline-node ${activeNode === index ? 'active' : ''}`}
                onClick={() => setActiveNode(index)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveNode(index); }}
              >
                <span className="node-number">{node.num}</span>
                <span className="node-text">{node.title}</span>
              </div>
            ))}
          </div>

          <div className="process-detail-box">
            <span className="mono-small" style={{ color: 'var(--cta-lake-blue)', display: 'block', marginBottom: '8px' }}>
              PHASE {processNodes[activeNode].num} DETAILS
            </span>
            <p className="mono-body" style={{ color: 'var(--text-off-black)', fontSize: '18px' }}>
              {processNodes[activeNode].detail}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
