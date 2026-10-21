import { ProjectsTab } from '@/components/sidepanel/ProjectsTab';
import { ProviderTab } from '@/components/sidepanel/ProviderTab';
import { StatusHeader } from '@/components/sidepanel/StatusHeader';
import { StyleTab } from '@/components/sidepanel/StyleTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSettings } from '@/hooks/use-settings';
import { getStatus } from '@/lib/settings';

export default function App() {
  const settings = useSettings();
  if (!settings) return null; // a local storage read; too brief to show a loader

  return (
    <div className="flex min-h-svh min-w-0 flex-col">
      <StatusHeader status={getStatus(settings)} />
      <Tabs defaultValue="provider" className="gap-4 p-4">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="provider">Provider</TabsTrigger>
          <TabsTrigger value="style">Style</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>
        {/* Stays mounted so the model list and open key forms survive tab switches.
            Style and Projects unmount on purpose: that flushes their pending edits. */}
        <TabsContent value="provider" keepMounted>
          <ProviderTab settings={settings} />
        </TabsContent>
        <TabsContent value="style">
          <StyleTab settings={settings} />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsTab settings={settings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
