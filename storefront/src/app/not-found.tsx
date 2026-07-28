import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="relative">
        <span className="select-none text-[7rem] font-black leading-none tracking-tighter opacity-10 sm:text-[10rem]">
          404
        </span>
      </div>
      <h1 className="-mt-4 text-2xl font-bold">Esta página no existe</h1>
      <p className="mt-2 max-w-sm text-sm opacity-60">
        El enlace puede estar roto o la página fue movida. Volvé al inicio y seguí comprando.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex items-center rounded-full bg-black px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] dark:bg-white dark:text-black"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
