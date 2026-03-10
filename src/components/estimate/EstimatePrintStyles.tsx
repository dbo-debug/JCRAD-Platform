export default function EstimatePrintStyles() {
  return (
    <style jsx global>{`
      @media print {
        .no-print {
          display: none !important;
        }

        .estimate-page {
          background: #fff !important;
          padding: 0 !important;
        }

        .estimate-card,
        .estimate-summary {
          box-shadow: none !important;
          border-color: #d1d5db !important;
        }

        .estimate-break-avoid {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    `}</style>
  );
}
