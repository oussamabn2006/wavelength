
import { Route, Routes } from 'react-router-dom'
import { Protected } from './components/auth/Protected'
import { Layout } from './components/layout/Layout'
import { ComingSoon } from './pages/ComingSoon'
import { AuthPage } from './pages/Auth'
import { HomePage } from './pages/Home'
import { SearchPage } from './pages/Search'
import { AlbumPage } from './pages/Album'
import { ArtistPage } from './pages/Artist'
import { LibraryPage } from './pages/Library'
import { PlaylistPage } from './pages/Playlist'
import { AccountPage } from './pages/Account'

import { HistoryPage } from './pages/History'
import { LikedPage } from './pages/Liked'
import { QueuePage } from './pages/Queue'
import { StatsPage } from './pages/Stats'
import { ChartsPage } from './pages/Charts'

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<AuthPage initial="login" />} />
      <Route path="signup" element={<AuthPage initial="signup" />} />
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="library" element={<Protected title="Your Library"><LibraryPage /></Protected>} />
        <Route path="playlist/:id" element={<PlaylistPage />} />
        <Route path="artist/:id" element={<ArtistPage />} />
        <Route path="album/:id" element={<AlbumPage />} />
        <Route path="account" element={<Protected title="Account"><AccountPage /></Protected>} />
        <Route path="history" element={<Protected title="Listening history"><HistoryPage /></Protected>} />
        <Route path="liked" element={<Protected title="Liked Songs"><LikedPage /></Protected>} />
        <Route path="queue" element={<Protected title="Queue"><QueuePage /></Protected>} />
        <Route path="stats" element={<Protected title="Your stats"><StatsPage /></Protected>} />
        <Route path="charts" element={<ChartsPage />} />

        <Route path="*" element={<ComingSoon title="Page not found" />} />
      </Route>
    </Routes>
  )
}
