import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TopicsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">키워드 탐색</h2>
      <Card>
        <CardHeader>
          <CardTitle>🔍 지금 뜨는 키워드</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Phase 4에서 Google Trends 연동 후 활성화됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
