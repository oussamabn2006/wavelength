export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="py-16 text-center">
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p className="mt-3 text-muted">This page is built in a later milestone.</p>
    </div>
  )
}