import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">설정</h2>
      <Card>
        <CardHeader>
          <CardTitle>⚙️ API 설정</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Phase 5에서 설정 페이지가 구현됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
