import { useParams } from 'common'
import type { PropsWithChildren } from 'react'
import { Admonition } from 'ui-patterns/Admonition'

import { ProjectIntegrationsLayout } from './ProjectIntegrationsLayout'
import { ProjectMarketplaceLayout } from './ProjectMarketplaceLayout'
import { useIsMarketplaceEnabled } from '@/components/interfaces/App/FeaturePreview/FeaturePreviewContext'
import { INTEGRATIONS } from '@/components/interfaces/Integrations/Landing/Integrations.constants'
import { isDatabaseExtensionSupported } from '@/lib/database-capabilities'

export const ProjectIntegrationsLayoutDispatch = ({ children }: PropsWithChildren) => {
  const isMarketplaceEnabled = useIsMarketplaceEnabled()
  const { id } = useParams()
  const integration = INTEGRATIONS.find((item) => item.id === id)
  if (integration && !integration.requiredExtensions.every(isDatabaseExtensionSupported)) {
    return (
      <Admonition
        type="default"
        title="Integration unavailable"
        description="This integration requires database extensions that are disabled for this deployment."
      />
    )
  }
  if (isMarketplaceEnabled) {
    return <ProjectMarketplaceLayout>{children}</ProjectMarketplaceLayout>
  }
  return <ProjectIntegrationsLayout>{children}</ProjectIntegrationsLayout>
}
