import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAddCustomer, useUpdateCustomer } from "@/lib/hooks";
import { formatPhoneForDisplay, normalizePhoneNumber } from "@/lib/utils";

interface RegisterCustomerProps {
  onBack?: () => void;
  // optional editing customer
  editingCustomer?: any | null;
  onSaved?: () => void;
}

const RegisterCustomer = ({ onBack, editingCustomer = null, onSaved }: RegisterCustomerProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    fullName: "",
    shopName: "",
    address: "",
    contactNumber: "",
    whatsappNumber: "",
  });

  const mutation = useAddCustomer();
  const updateMutation = useUpdateCustomer();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const normalizedWhatsapp = normalizePhoneNumber(formData.whatsappNumber);
      if (!normalizedWhatsapp) {
        toast({
          title: "Invalid WhatsApp number",
          description: "Please enter a valid WhatsApp number with country code.",
          variant: "destructive",
        });
        return;
      }

      let normalizedContact: string | null = null;
      const rawContact = formData.contactNumber.trim();
      if (rawContact.length > 0) {
        normalizedContact = normalizePhoneNumber(rawContact);
        if (!normalizedContact) {
          toast({
            title: "Invalid contact number",
            description: "Please enter a valid contact number with country code or leave it blank.",
            variant: "destructive",
          });
          return;
        }
      }

      if (editingCustomer) {
        await updateMutation.mutateAsync({
          id: editingCustomer.id,
          changes: {
            full_name: formData.fullName,
            shop_name: formData.shopName,
            address: formData.address,
            contact: normalizedContact,
            whatsapp_number: normalizedWhatsapp,
          },
        });
      } else {
        await mutation.mutateAsync({
          full_name: formData.fullName,
          shop_name: formData.shopName,
          address: formData.address,
          contact: normalizedContact,
          whatsapp_number: normalizedWhatsapp,
        });
      }

      toast({ title: editingCustomer ? "Customer Updated" : "Customer Registered", description: `${formData.fullName} has been ${editingCustomer ? 'updated' : 'added'} to the system.` });

  setFormData({ fullName: "", shopName: "", address: "", contactNumber: "", whatsappNumber: "" });
      if (onSaved) onSaved();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to register customer",
      });
    }
  };

  useEffect(() => {
    if (editingCustomer) {
      const contactDisplayRaw = editingCustomer.contact
        ? formatPhoneForDisplay(editingCustomer.contact) ?? editingCustomer.contact
        : "";
      const contactDisplay = contactDisplayRaw ? contactDisplayRaw.replace(/[^0-9]/g, "") : "";
      const whatsappDisplayRaw = editingCustomer.whatsapp_number
        ? formatPhoneForDisplay(editingCustomer.whatsapp_number) ?? editingCustomer.whatsapp_number
        : editingCustomer.contact
        ? formatPhoneForDisplay(editingCustomer.contact) ?? editingCustomer.contact
        : "";
      const whatsappDisplay = whatsappDisplayRaw ? whatsappDisplayRaw.replace(/[^0-9]/g, "") : "";

      setFormData({
        fullName: editingCustomer.full_name ?? '',
        shopName: editingCustomer.shop_name ?? '',
        address: editingCustomer.address ?? '',
        contactNumber: contactDisplay,
        whatsappNumber: whatsappDisplay,
      });
    }
  }, [editingCustomer]);

  return (
    <div className="space-y-4">
      {onBack && (
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Register New Customer</CardTitle>
          <CardDescription>Add a new customer or vendor to your network</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Enter customer's full name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shopName">Shop/Business Name *</Label>
              <Input
                id="shopName"
                value={formData.shopName}
                onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                placeholder="Enter shop or business name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Full Address *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Enter complete address"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactNumber">Contact Number (Optional)</Label>
              <Input
                id="contactNumber"
                type="tel"
                value={formData.contactNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contactNumber: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
                placeholder="Enter contact number"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="whatsappNumber">WhatsApp Number</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      whatsappNumber:
                        prev.contactNumber.length > 0 ? prev.contactNumber : prev.whatsappNumber,
                    }))
                  }
                >
                  Same as contact
                </Button>
              </div>
              <Input
                id="whatsappNumber"
                type="tel"
                value={formData.whatsappNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    whatsappNumber: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
                placeholder="WhatsApp number for reminders"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={mutation.status === "pending"}>
              {mutation.status === "pending" ? "Registering..." : "Register Customer"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegisterCustomer;
