import { useState, useEffect } from 'react'
import './App.css'
import { BackgroundCanvas } from './BackgroundCanvas'

function useMSTClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  )
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
    }, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

interface Commit {
  sha: string
  message: string
  date: string
}

const PROJECTS = [  
  { name: 'yylobby', desc: 'game lobby client', lang: 'TypeScript', url: 'https://github.com/ykc1n/yylobby' },
  { name: 'overdryve', desc: 'web app', lang: 'TypeScript', url: 'https://github.com/ykc1n/overdryve', live: 'https://overdryve.vercel.app' },
  { name: 'istrohub2', desc: 'shipyard', lang: 'TypeScript', url: 'https://github.com/ykc1n/istrohub2', live: 'https://shipyard-theta.vercel.app' },
] as const

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function App() {
  const time = useMSTClock()
  const [selected, setSelected] = useState<string | null>(null)
  const [contentVisible, setContentVisible] = useState(false)
  const [commits, setCommits] = useState<Commit[]>([])
  const [readme, setReadme] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('https://api.github.com/users/ykc1n/repos?per_page=30')
      .then(r => r.json())
      .then((repos: Array<{ name: string; pushed_at: string }>) => {
        const map: Record<string, string> = {}
        for (const r of repos) map[r.name] = r.pushed_at
        setUpdatedAt(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selected) {
      setContentVisible(false)
      const t = setTimeout(() => { setCommits([]); setReadme(null) }, 200)
      return () => clearTimeout(t)
    }

    // fade out old content, then fetch + fade in
    setContentVisible(false)
    setCommits([])
    setReadme(null)

    const t = setTimeout(() => {
      setLoading(true)
      setContentVisible(true)

      const commitsReq = fetch(`https://api.github.com/repos/ykc1n/${selected}/commits?per_page=10`)
        .then(r => r.json())
        .then((data: Array<{ sha: string; commit: { message: string; author: { date: string } } }>) => {
          setCommits(data.map(c => ({
            sha: c.sha,
            message: c.commit.message.split('\n')[0],
            date: new Date(c.commit.author.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })))
        })
        .catch(() => setCommits([]))

      const readmeReq = fetch(`https://api.github.com/repos/ykc1n/${selected}/readme`, {
        headers: { Accept: 'application/vnd.github.raw+json' },
      })
        .then(r => r.ok ? r.text() : null)
        .then(text => setReadme(text))
        .catch(() => setReadme(null))

      Promise.all([commitsReq, readmeReq]).finally(() => setLoading(false))
    }, 200)

    return () => clearTimeout(t)
  }, [selected])
  return (
    <>
    <BackgroundCanvas />
    <div className='fixed inset-0 bg-black/30' />
    <div className='flex items-center justify-center h-screen relative'>
      <div className='bg-blue-950/5 backdrop-blur-2xl rounded-lg border border-blue-300/10 shadow-2xl p-6 w-[480px] flex flex-col gap-4'>

        {/* intro */}
        <div className='text-sm'>
          hello, im nick<br />
          check out my <a href='https://github.com/ykc1n' target='_blank' rel='noopener noreferrer' className='text-blue-500'>GitHub</a>
          <br />you can reach me at kcyn.dev@gmail.com
          <div className='text-xs text-white/40 mt-1'>{time} MST</div>
        </div>

        <hr className='border-white/10' />

        {/* project list */}
        <div className='flex flex-col gap-2'>
          <div className='text-xs text-white/40 mb-1'>projects</div>
          {PROJECTS.map((p) => (
            <div
              key={p.name}
              onClick={() => setSelected(selected === p.name ? null : p.name)}
              className={`cursor-pointer p-3 rounded-lg border transition-all duration-300 hover:border-blue-300/25 ${selected === p.name ? 'border-blue-400/30 bg-blue-950/10' : 'border-blue-300/10 bg-blue-950/5'}`}
            >
              <div className='flex items-center justify-between'>
                <span className='text-white/90 text-sm font-semibold'>{p.name}</span>
                <span className='text-xs text-white/25'>{p.lang}</span>
              </div>
              <div className='flex items-center justify-between mt-1'>
                <div className='flex gap-3 text-xs text-white/30'>
                  <a href={p.url} target='_blank' rel='noopener noreferrer' className='hover:text-white/60' onClick={(e) => e.stopPropagation()}>github</a>
                  {'live' in p && p.live && <a href={p.live} target='_blank' rel='noopener noreferrer' className='hover:text-white/60' onClick={(e) => e.stopPropagation()}>live</a>}
                </div>
                {updatedAt[p.name] && <span className='text-xs text-white/25'>{timeAgo(updatedAt[p.name])}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* project details */}
        <div
          className='grid transition-[grid-template-rows] duration-300 ease-in-out'
          style={{ gridTemplateRows: selected ? '1fr' : '0fr' }}
        >
          <div className='overflow-hidden'>
            <hr className='border-white/10 mb-4' />
            <div
              className='flex flex-col gap-3 transition-opacity duration-200'
              style={{ opacity: contentVisible ? 1 : 0 }}
            >
              {loading && <div className='text-xs text-white/30'>loading...</div>}
              {!loading && (
                <>
                  {readme && (
                    <>
                      <div className='text-xs text-white/40'>readme</div>
                      <pre className='text-xs text-white/50 whitespace-pre-wrap break-words max-h-36 overflow-y-auto'>{readme}</pre>
                      <hr className='border-white/10' />
                    </>
                  )}
                  <div className='text-xs text-white/40'>commits</div>
                  <div className='overflow-y-auto max-h-36 flex flex-col gap-2'>
                    {commits.map(c => (
                      <div key={c.sha} className='pb-2 border-b border-white/5 last:border-0'>
                        <div className='text-xs text-white/70 truncate'>{c.message}</div>
                        <div className='text-xs text-white/25 mt-0.5 flex justify-between'>
                          <span>{c.sha.slice(0, 7)}</span>
                          <span>{c.date}</span>
                        </div>
                      </div>
                    ))}
                    {commits.length === 0 && <div className='text-xs text-white/30'>no commits found</div>}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
    </>
  )
}

export default App
