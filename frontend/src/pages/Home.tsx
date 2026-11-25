import { HomeSections } from '../components/music/HomeSections'
import { RecentlyPlayed } from '../components/music/RecentlyPlayed'

export function HomePage() {
  return (
    <div>
      <RecentlyPlayed />
      <HomeSections />
    </div>
  )
}