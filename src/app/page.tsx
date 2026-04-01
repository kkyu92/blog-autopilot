import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">대시보드</h2>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">초안</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">발행 완료</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">실패</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
      </div>

      {/* Trending keywords placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🔥 지금 뜨는 키워드
            <Badge variant="secondary">준비 중</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Phase 4에서 Google Trends 연동 후 활성화됩니다.
          </p>
        </CardContent>
      </Card>

      {/* Recent drafts placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>최근 초안</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            아직 작성한 글이 없습니다. &quot;새 글 작성&quot; 버튼으로 시작하세요.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
