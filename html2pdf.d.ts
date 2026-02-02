declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: { scale?: number; useCORS?: boolean; logging?: boolean; [key: string]: any };
    jsPDF?: { unit?: string; format?: string | number[]; orientation?: string; [key: string]: any };
    pagebreak?: { mode?: string | string[]; before?: string | string[]; after?: string | string[]; avoid?: string | string[] };
  }

  interface Html2PdfWorker {
    set(options: Html2PdfOptions): Html2PdfWorker;
    from(element: HTMLElement | string): Html2PdfWorker;
    save(): Promise<void>;
    outputPdf(type?: string): Promise<any>;
    output(type: string, options?: any): Promise<any>;
    then(callback: (pdf: any) => void): Html2PdfWorker;
  }

  function html2pdf(): Html2PdfWorker;
  function html2pdf(element: HTMLElement, options?: Html2PdfOptions): Html2PdfWorker;

  export = html2pdf;
}
