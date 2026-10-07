import { translate, useUiLanguage } from '../../lib/i18n'
export function ComingSoonPage({ title }: { title: string }) {
  useUiLanguage()

  return (
    <div className="dashboard-content">
      <section className="panel grid min-h-80 place-items-center p-8 text-center">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.16em] text-[#b18316]">
            {translate('In construction')}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-[var(--text)]">{title}</h2>
          <p className="mt-3 max-w-md text-[#8c806e]">
            {translate('This section is ready for its dedicated feature module.')}
          </p>
        </div>
      </section>
    </div>
  )
}
