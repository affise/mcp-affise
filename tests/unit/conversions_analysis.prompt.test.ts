/**
 * Tests for createConversionsAnalysisPrompt — the factory that builds the
 * analyze_conversions MCP prompt body.
 */

import {
  createConversionsAnalysisPrompt,
  type ConversionsAnalysisType,
} from '../../src/prompts/conversions_analysis.js';

const SAMPLE_DATA = JSON.stringify({ conversions: [{ id: 1, status: 'confirmed', country: 'US' }] });

function getText(result: ReturnType<typeof createConversionsAnalysisPrompt>): string {
  return result.messages[0].content.text;
}

describe('createConversionsAnalysisPrompt', () => {
  it('returns an MCP user message with the data embedded', () => {
    const result = createConversionsAnalysisPrompt({ conversions_data: SAMPLE_DATA });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content.type).toBe('text');
    expect(getText(result)).toContain(SAMPLE_DATA);
  });

  it('defaults to comprehensive + detailed', () => {
    const result = createConversionsAnalysisPrompt({ conversions_data: SAMPLE_DATA });
    const text = getText(result);
    expect(text).toMatch(/comprehensive review/i);
    expect(text).toMatch(/detailed analysis/i);
  });

  describe('analysis_type lenses', () => {
    const lenses: { type: ConversionsAnalysisType; signal: RegExp }[] = [
      { type: 'comprehensive',   signal: /comprehensive review/i },
      { type: 'fraud_review',    signal: /fraud and quality/i },
      { type: 'attribution',     signal: /attribution-path/i },
      { type: 'partner_quality', signal: /partner-quality/i },
      { type: 'geo_tech',        signal: /geo\/tech breakdown/i },
      { type: 'payouts',         signal: /financial review/i },
    ];

    for (const { type, signal } of lenses) {
      it(`emits the ${type} header`, () => {
        const result = createConversionsAnalysisPrompt({
          conversions_data: SAMPLE_DATA,
          analysis_type: type,
        });
        expect(getText(result)).toMatch(signal);
      });
    }
  });

  describe('analysis-type-specific tasks', () => {
    it('fraud_review mentions fraud_risk_level and click→conversion timing', () => {
      const text = getText(
        createConversionsAnalysisPrompt({ conversions_data: SAMPLE_DATA, analysis_type: 'fraud_review' })
      );
      expect(text).toMatch(/fraud_risk_level/);
      expect(text).toMatch(/click.*conversion.*timing|Click→conversion timing/i);
    });

    it('attribution mentions sub1..sub8 and click_id', () => {
      const text = getText(
        createConversionsAnalysisPrompt({ conversions_data: SAMPLE_DATA, analysis_type: 'attribution' })
      );
      expect(text).toMatch(/sub1\.\.sub8|sub-ID/i);
      expect(text).toMatch(/click_id|cbid/i);
    });

    it('partner_quality mentions confirmed % and decline %', () => {
      const text = getText(
        createConversionsAnalysisPrompt({ conversions_data: SAMPLE_DATA, analysis_type: 'partner_quality' })
      );
      expect(text).toMatch(/confirmed %/);
      expect(text).toMatch(/decline.*%|declined %/i);
    });

    it('geo_tech mentions country and ISP', () => {
      const text = getText(
        createConversionsAnalysisPrompt({ conversions_data: SAMPLE_DATA, analysis_type: 'geo_tech' })
      );
      expect(text).toMatch(/country/i);
      expect(text).toMatch(/ISP|isp_code/i);
    });

    it('payouts mentions revenue / payouts and margin', () => {
      const text = getText(
        createConversionsAnalysisPrompt({ conversions_data: SAMPLE_DATA, analysis_type: 'payouts' })
      );
      expect(text).toMatch(/Revenue mix|revenue/i);
      expect(text).toMatch(/payouts/i);
      expect(text).toMatch(/margin/i);
    });
  });

  describe('format variations', () => {
    it('summary format reflects the concise instruction', () => {
      const text = getText(
        createConversionsAnalysisPrompt({ conversions_data: SAMPLE_DATA, format: 'summary' })
      );
      expect(text).toMatch(/concise summary/i);
    });

    it('actionable format asks for prioritized recommendations', () => {
      const text = getText(
        createConversionsAnalysisPrompt({ conversions_data: SAMPLE_DATA, format: 'actionable' })
      );
      expect(text).toMatch(/prioritized recommendations/i);
    });
  });

  describe('focus_areas and comparison_criteria', () => {
    it('embeds focus_areas list when provided', () => {
      const text = getText(
        createConversionsAnalysisPrompt({
          conversions_data: SAMPLE_DATA,
          focus_areas: ['sub5 quality', 'TR traffic'],
        })
      );
      expect(text).toContain('sub5 quality');
      expect(text).toContain('TR traffic');
      expect(text).toMatch(/FOCUS AREAS/);
    });

    it('omits focus block when focus_areas is empty', () => {
      const text = getText(createConversionsAnalysisPrompt({ conversions_data: SAMPLE_DATA }));
      expect(text).not.toMatch(/FOCUS AREAS/);
    });

    it('embeds comparison_criteria when provided', () => {
      const text = getText(
        createConversionsAnalysisPrompt({
          conversions_data: SAMPLE_DATA,
          comparison_criteria: 'partners 3554 vs 4108',
        })
      );
      expect(text).toMatch(/COMPARISON/);
      expect(text).toContain('partners 3554 vs 4108');
    });
  });

  it('unknown analysis_type falls back to comprehensive tasks', () => {
    const text = getText(
      createConversionsAnalysisPrompt({
        conversions_data: SAMPLE_DATA,
        analysis_type: 'something_weird' as any,
      })
    );
    // Falls through to the comprehensive task list
    expect(text).toMatch(/Top geo|Status breakdown/i);
  });
});
