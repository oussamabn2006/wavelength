
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { ComingSoon } from './pages/ComingSoon'
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
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="playlist/:id" element={<PlaylistPage />} />
        <Route path="artist/:id" element={<ArtistPage />} />
        <Route path="album/:id" element={<AlbumPage />} />
        <Route path="account" element={<AccountPage />} />

        <Route path="history" element={<HistoryPage />} />
        <Route path="liked" element={<LikedPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="charts" element={<ChartsPage />} />

        <Route path="*" element={<ComingSoon title="Page not found" />} />
      </Route>
    </Routes>
  )
}
