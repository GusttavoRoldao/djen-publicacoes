/** A mesma marca do ícone do aplicativo, para a barra lateral e a tela de abertura. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      height={size}
      viewBox="0 0 512 512"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="512" height="512" rx="102" fill="#131010" />
      <path fill="#F5F0EF" d="M126 104a26 26 0 0 1 26-26h164l70 70v260a26 26 0 0 1-26 26H152a26 26 0 0 1-26-26z" />
      <path fill="#D9CBC8" d="M316 78l70 70h-46a24 24 0 0 1-24-24z" />
      <path fill="#810100" d="M186 78h74v370l-37-38-37 38z" />
    </svg>
  );
}
