import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useCreateBatch } from "@/lib/hooks";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface CreateBatchProps {
  onBack?: () => void;
}

const CreateBatch = ({ onBack }: CreateBatchProps) => {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const create = useCreateBatch();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleCreate = async () => {
    if (!name || !quantity || !rate) {
      toast({ title: "Missing fields", description: "Please fill all fields", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({ name, total_quantity: Number(quantity), purchase_rate: Number(rate) });
      toast({ title: "Batch Created", description: `${name} added with ${quantity}kg` });
      setName(""); setQuantity(""); setRate("");
      if (onBack) {
        onBack();
      } else {
        navigate(-1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to create batch" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Tea Batch</CardTitle>
        <CardDescription>Record purchased tea in inventory</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <Label>Tea Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="E.g. Assam TGFOP" />
          </div>
          <div>
            <Label>Total Quantity (kg)</Label>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>Purchase Rate (₹/kg)</Label>
            <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                if (onBack) onBack();
                else navigate(-1);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create Batch</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CreateBatch;
