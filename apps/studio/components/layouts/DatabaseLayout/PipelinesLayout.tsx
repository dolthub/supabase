import { useParams } from 'common'
import { PropsWithChildren } from 'react'
import { Admonition } from 'ui-patterns/Admonition'

import { DatabaseLayout } from './DatabaseLayout'
import { IS_REPLICATION_ENABLED } from '@/lib/database-capabilities'
import { PipelineRequestStatusProvider } from '@/state/replication-pipeline-request-status'

export const PipelinesLayout = ({ children }: PropsWithChildren) => {
  const { ref: projectRef } = useParams()

  return (
    <DatabaseLayout title="Pipelines">
      {IS_REPLICATION_ENABLED ? (
        <PipelineRequestStatusProvider key={projectRef}>{children}</PipelineRequestStatusProvider>
      ) : (
        <Admonition
          type="default"
          title="Replication disabled"
          description="Replication pipelines are disabled for this deployment."
        />
      )}
    </DatabaseLayout>
  )
}
