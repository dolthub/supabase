import { Admonition } from 'ui-patterns/Admonition'
import { PageContainer } from 'ui-patterns/PageContainer'
import { PageSection, PageSectionContent } from 'ui-patterns/PageSection'

import { EventTriggersList } from '@/components/interfaces/Database/Triggers/EventTriggersList/EventTriggersList'
import { DatabaseTriggersLayout } from '@/components/layouts/DatabaseLayout/DatabaseTriggersLayout'
import { DefaultLayout } from '@/components/layouts/DefaultLayout'
import { IS_EVENT_TRIGGERS_ENABLED } from '@/lib/database-capabilities'
import type { NextPageWithLayout } from '@/types'

export const TriggersSchemaPage: NextPageWithLayout = () => {
  return (
    <PageContainer size="large">
      <PageSection>
        <PageSectionContent>
          {IS_EVENT_TRIGGERS_ENABLED ? (
            <EventTriggersList />
          ) : (
            <Admonition
              type="default"
              title="Event triggers unavailable"
              description="Event triggers are disabled for this deployment. Enable Row Level Security explicitly when creating tables."
            />
          )}
        </PageSectionContent>
      </PageSection>
    </PageContainer>
  )
}

TriggersSchemaPage.getLayout = (page) => (
  <DefaultLayout>
    <DatabaseTriggersLayout>{page}</DatabaseTriggersLayout>
  </DefaultLayout>
)

export default TriggersSchemaPage
