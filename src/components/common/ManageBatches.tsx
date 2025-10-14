import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBatches, useCreateBatch, useUpdateBatch, useDeleteBatch } from "@/lib/hooks";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const ManageBatches = ({ onBack }: { onBack?: () => void }) => {
  const { data: batches, isLoading } = useBatches();
  const create = useCreateBatch();
  const update = useUpdateBatch();
  const del = useDeleteBatch();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");

  const startEdit = (b: any) => {
    setEditingId(b.id);
    setName(b.name);
    setQty(String(b.total_quantity || b.remaining_quantity || ""));
    setRate(String(b.purchase_rate || ""));
  };

  const cancelEdit = () => { setEditingId(null); setName(""); setQty(""); setRate(""); };

  const handleSave = async () => {
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, changes: { name, total_quantity: Number(qty), remaining_quantity: Number(qty), purchase_rate: Number(rate) } });
        toast({ title: "Batch updated" });
        cancelEdit();
        return;
      }
      await create.mutateAsync({ name, total_quantity: Number(qty), purchase_rate: Number(rate) });
      toast({ title: "Batch created" });
      setName(""); setQty(""); setRate("");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete batch? This will orphan related transactions.')) return;
    try {
      await del.mutateAsync(id);
      toast({ title: 'Deleted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to delete' });
    }
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Manage Batches</CardTitle>
          <div>
            {onBack && (
              <Button variant="ghost" onClick={handleBack}>Back</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Tea name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
            <Input placeholder="Purchase rate" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave}>{editingId ? 'Save' : 'Create'}</Button>
            {editingId && <Button variant="outline" onClick={cancelEdit}>Cancel</Button>}
          </div>

          <div className="space-y-2">
            {isLoading ? <div>Loading...</div> : (batches || []).map((b: any) => (
              <div key={b.id} className="flex items-center justify-between border rounded-md p-2">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">Remaining: {b.remaining_quantity} kg • Rate: ₹{Number(b.purchase_rate).toFixed(2)}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => startEdit(b)}>Edit</Button>
                  <Button variant="destructive" onClick={() => handleDelete(b.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ManageBatches;
