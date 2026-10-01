import { LOCAL_STORAGE_KEYS, useParams } from 'common'
import { usePathname } from 'next/navigation'
import { PropsWithChildren, useEffect, useRef } from 'react'
import { Admonition } from 'ui-patterns/Admonition'

import { ProjectLayout } from '../ProjectLayout'
import { ObservabilityMenu } from './ObservabilityMenu'
import { useIndexAdvisorStatus } from '@/components/interfaces/QueryPerformance/hooks/useIsIndexAdvisorStatus'
import { BannerIndexAdvisor } from '@/components/ui/BannerStack/Banners/BannerIndexAdvisor'
import { useBannerStack } from '@/components/ui/BannerStack/BannerStackProvider'
import { UnknownInterface } from '@/components/ui/UnknownInterface'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { useLocalStorageQuery } from '@/hooks/misc/useLocalStorage'
import { withAuth } from '@/hooks/misc/withAuth'
import { IS_QUERY_STATISTICS_ENABLED } from '@/lib/database-capabilities'

interface ObservabilityLayoutProps {
  title: string
}

const ObservabilityLayoutContent = ({
  title,
  children,
}: PropsWithChildren<ObservabilityLayoutProps>) => {
  const { ref } = useParams()
  const pathname = usePathname()
  const { addBanner, dismissBanner } = useBannerStack()
  const { isIndexAdvisorAvailable, isIndexAdvisorEnabled } = useIndexAdvisorStatus()

  const [isIndexAdvisorBannerDismissed] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.INDEX_ADVISOR_NOTICE_DISMISSED(ref ?? ''),
    false
  )

  const prevPathnameRef = useRef(pathname)

  useEffect(() => {
    const isQueryPerformancePage = pathname?.includes('/query-performance')

    if (
      isQueryPerformancePage &&
      isIndexAdvisorAvailable &&
      !isIndexAdvisorEnabled &&
      !isIndexAdvisorBannerDismissed
    ) {
      addBanner({
        id: 'index-advisor-banner',
        isDismissed: false,
        content: <BannerIndexAdvisor />,
        priority: 3,
      })
    } else if (isIndexAdvisorBannerDismissed || !isQueryPerformancePage || isIndexAdvisorEnabled) {
      dismissBanner('index-advisor-banner')
    }

    prevPathnameRef.current = pathname
  }, [
    pathname,
    isIndexAdvisorAvailable,
    isIndexAdvisorEnabled,
    isIndexAdvisorBannerDismissed,
    addBanner,
    dismissBanner,
  ])

  const { reportsAll } = useIsFeatureEnabled(['reports:all'])

  if (reportsAll) {
    return (
      <ProjectLayout
        product="Observability"
        browserTitle={{ section: title }}
        productMenu={<ObservabilityMenu />}
        isBlocking={false}
      >
        {children}
      </ProjectLayout>
    )
  } else {
    return <UnknownInterface urlBack={`/project/${ref}`} />
  }
}

const ObservabilityLayout = (props: PropsWithChildren<ObservabilityLayoutProps>) => {
  const { ref } = useParams()
  const pathname = usePathname()
  const { reportsAll } = useIsFeatureEnabled(['reports:all'])

  if (
    !IS_QUERY_STATISTICS_ENABLED &&
    (pathname?.includes('/query-performance') || pathname?.includes('/query-insights'))
  ) {
    return (
      <Admonition
        type="default"
        title="Query statistics unavailable"
        description="Query statistics are disabled for this deployment."
      />
    )
  }

  if (reportsAll) {
    return <ObservabilityLayoutContent {...props} />
  } else {
    return <UnknownInterface urlBack={`/project/${ref}`} />
  }
}

export default withAuth(ObservabilityLayout)
