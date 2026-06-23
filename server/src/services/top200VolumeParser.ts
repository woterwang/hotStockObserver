export interface Top200VolumeStockRow {
  rank: number;
  code: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  speedPercent: number;
  turnoverRate: number;
  volumeRatio: number;
  amplitude: number;
  turnover: number;
  floatShares: number;
  floatMarketValue: number;
  peRatio: number;
  turnoverText: string;
  floatSharesText: string;
  floatMarketValueText: string;
}

export class Top200VolumeParser {
  private decodeHtmlEntities (value: string): string {
    const entities: Record<string, string> = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
    };

    return value.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, m => entities[m] || m);
  }

  private stripHtmlTags (value: string): string {
    return this.decodeHtmlEntities(value)
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toNumber (value: string): number {
    const normalized = value.replace(/,/g, '').replace(/%/g, '').trim();
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parseCnNumberWithUnit (value: string): number {
    const normalized = value.replace(/,/g, '').trim();
    const parsed = Number.parseFloat(normalized.replace(/[^\d.-]/g, ''));

    if (!Number.isFinite(parsed)) {
      return 0;
    }

    if (normalized.includes('万亿')) {
      return parsed * 1_0000_0000_0000;
    }
    if (normalized.includes('亿')) {
      return parsed * 1_0000_0000;
    }
    if (normalized.includes('万')) {
      return parsed * 1_0000;
    }
    if (normalized.includes('千')) {
      return parsed * 1000;
    }

    return parsed;
  }

  parseTop200VolumeHtml (html: string): Top200VolumeStockRow[] {
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) {
      return [];
    }

    const rowHtmlList = tbodyMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const rows = rowHtmlList
      .map((rowHtml) => {
        const cellHtmlList = rowHtml.match(/<td[\s\S]*?<\/td>/gi) || [];
        if (cellHtmlList.length < 14) {
          return null;
        }

        const cells = cellHtmlList.map(cell => this.stripHtmlTags(cell));
        const code = cells[1].replace(/[^0-9]/g, '');

        if (code.length !== 6) {
          return null;
        }

        return {
          rank: Number.parseInt(cells[0], 10) || 0,
          code,
          name: cells[2],
          price: this.toNumber(cells[3]),
          changePercent: this.toNumber(cells[4]),
          changeAmount: this.toNumber(cells[5]),
          speedPercent: this.toNumber(cells[6]),
          turnoverRate: this.toNumber(cells[7]),
          volumeRatio: this.toNumber(cells[8]),
          amplitude: this.toNumber(cells[9]),
          turnover: this.parseCnNumberWithUnit(cells[10]),
          floatShares: this.parseCnNumberWithUnit(cells[11]),
          floatMarketValue: this.parseCnNumberWithUnit(cells[12]),
          peRatio: this.toNumber(cells[13]),
          turnoverText: cells[10],
          floatSharesText: cells[11],
          floatMarketValueText: cells[12],
        };
      })
      .filter((row): row is Top200VolumeStockRow => row !== null);

    return rows;
  }
}

export const top200VolumeParser = new Top200VolumeParser();