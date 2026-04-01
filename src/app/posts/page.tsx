import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PostsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">콘텐츠 목록</h2>
      <Card>
        <CardHeader>
          <CardTitle>📝 내 콘텐츠</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            아직 작성한 글이 없습니다. 키워드를 선택하여 새 글을 작성해보세요.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
